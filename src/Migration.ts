import Clubhouse, { Epic, File, Member, Project, Story, StoryLink, Workflow } from 'clubhouse-lib';
import { Attachment, Issue, IssueLinkTypeEnum, IssueType, JiraEpic, JiraProject, JiraRegularIssue, User } from './jira/jira-types';
import * as _ from 'lodash';
import { partition } from 'lodash';
import { EpicStates, WorkflowState } from 'clubhouse-lib/build/types';
import axios from 'axios';
import * as util from 'util';
import * as request from 'request';
import jiraApi from './jira/jiraApi';
import {
  CLUBHOUSE, getEmailForUser, JIRA, jiraEpicToChEpicStateMapping, jiraToClubhouseStateMapping,
  jiraUserToClubhouseUsername, replaceUserReferencesInComment
} from '../config';
import { issueLinkToStoryLinkMapping, jiraIssueTypeToClubhouseStoryTypeMapping } from './standard-mappings';

import * as FormData from 'form-data';

type ClubhouseWorkflowStateId = number;

const CLUBHOUSE_USER_SESSION_HEADERS = {
  'Clubhouse-Organization': CLUBHOUSE.ORGANIZATION_ID,
  'Content-Type': 'application/json; charset=UTF-8',
  Cookie: CLUBHOUSE.SESSION_COOKIE
};

function isEpic(issue: Issue) {
  return issue.fields.issuetype.name === IssueType.Epic;
}

function createStateMapping(states: WorkflowState[]) {
  return _.mapValues(jiraToClubhouseStateMapping, (clubhouseState, jiraState) => {
    return states.find(state => state.name === clubhouseState).id;
  });
}

export function jiraProjectToClubhouseProject(project: JiraProject): Project {
  return {
    name: project.name,
    abbreviation: project.key,
    external_id: project.key
  } as any;
}

// in a given issue pair can have multiple links between each other, in clubhouse not. So we have to remove those duplicate links beforehand and just take the first.
function computeLinkDeduplicationKey(linkInfo: Pick<IssueLinkInfo, 'inwardKey' | 'outwardKey'>) {
  return linkInfo.inwardKey > linkInfo.outwardKey ?
    linkInfo.inwardKey + linkInfo.outwardKey :
    linkInfo.outwardKey + linkInfo.inwardKey;
}

type IssueLinkInfo = {
  type: IssueLinkTypeEnum,
  inwardKey?: string,
  outwardKey?: string,
}

export class Migration {

  constructor(private clubhouse = Clubhouse.create(CLUBHOUSE.API_TOKEN)) {}

  private existingProjectsByKey: { [jiraKey: string]: Project };
  private existingEpicsByKey: { [jiraKey: string]: Epic };
  private existingStoriesByKey: { [jiraKey: string]: Story };
  private existingChFiles: { [jiraId: string]: File };
  private existingLinkDeduplicationKeys = new Set<string>();

  private jiraIssuesByKey: { [jiraKey: string]: Issue };
  private labelsToArchive = new Set<string>();

  private jiraIssues: Issue[];
  private jiraProjects: JiraProject[];

  private members: Member[];

  private jiraIssieToChStatusIdMapping: { [jiraState: string]: ClubhouseWorkflowStateId };

  private mapJiraStatusToClubhouseWorkflowStatusId(jiraStatus: string) {
    const result = this.jiraIssieToChStatusIdMapping[jiraStatus];
    if (!result) {
      throw new Error(`could not find valid mapping for status: ${jiraStatus}`);
    }
    return result;
  }

  private mapJiraEpicStatusToClubHouseEpicStatus(status: string): EpicStates {
    const result = jiraEpicToChEpicStateMapping[status];
    if (!result) {
      throw new Error(`could not find valid mapping for epic status: ${status}`);
    }
    return result;
  }

  private getClubhouseUserIdFromJiraUsername(jiraUser: User): string {

    const clubhouseUsername = jiraUserToClubhouseUsername(jiraUser);

    const member = this.members.find(member => member.profile.mention_name === clubhouseUsername);

    if (!member) {
      throw new Error(`Didn't find a corresponding clubhouse user: ${clubhouseUsername} for the jira user: ${jiraUser.name}. Available clubhouse users are ${this.members.map(member => member.profile.mention_name)}`)
    }

    return member.id as string;
  }

  private getClubhouseEpicIdFromJiraEpicKey(jiraEpicKey: string): number | null {
    const epic = this.existingEpicsByKey[jiraEpicKey];
    return epic ? epic.id as number : null;
  }

  private jiraEpicToClubhouseEpic(issue: JiraEpic): Epic {
    const fields = issue.fields;

    const owner_ids = _.compact([_.get(fields, 'assignee'), fields.creator]).map(this.getClubhouseUserIdFromJiraUsername.bind(this));
    const epic: Partial<Epic> = {
      name: fields[JIRA.EPIC_TITLE_CUSTOM_FIELD],
      description: fields.summary + '\n' + replaceUserReferencesInComment(fields.description || '') + `\n\nOriginal Jira Epic: ${JIRA.BASE_URL}/browse/${issue.key}`,
      created_at: fields.created,
      updated_at: fields.updated,
      external_id: issue.key,
      owner_ids: owner_ids,
      state: this.mapJiraEpicStatusToClubHouseEpicStatus(fields.status.name)
    };
    return epic as any;
  }

  private jiraIssueToClubhouseStory(issue: JiraRegularIssue): Story {
    const fields = issue.fields;

    const labels = [{name: 'JIRA'}];

    if (issue.fields[JIRA.SPRINTINFO_CUSTOM_FIELD]) {
      issue.fields[JIRA.SPRINTINFO_CUSTOM_FIELD].forEach(sprintInfo => {
        let sprintName = sprintInfo.match(/name=(.*),goal=/)[1];
        if (!sprintName) {
          throw new Error(`Could not extract sprint name from sprintinfo of issue ${issue.key}, sprintinfo: ${sprintInfo}`);
        }
        sprintName = sprintName.replace(/\s/g, '-');
        let sprintStatus = sprintInfo.match(/state=(.*),name=/)[1];

        if (sprintStatus === 'CLOSED') {
          this.labelsToArchive.add(sprintName);
        }

        labels.push({name: sprintName});
      });
    }

    if (issue.fields.fixVersions.length > 0) {
      // extract release info and assign released stories to a tag with the same name as the release
      const jiraRelease = issue.fields.fixVersions[0];
      const labelName = `Release-${jiraRelease.releaseDate}-${jiraRelease.name}`;
      labels.push({name: labelName});
      this.labelsToArchive.add(labelName);
    }

    const story: Partial<Story> = {
      name: `${issue.key} ${fields.summary}`,
      project_id: this.existingProjectsByKey[issue.fields.project.key].id as number,
      description: replaceUserReferencesInComment(fields.description || '') + `\n\nOriginal Jira Issue: [${issue.key}](${JIRA.BASE_URL}/browse/${issue.key})`,
      updated_at: fields.updated,
      created_at: fields.created,
      workflow_state_id: this.mapJiraStatusToClubhouseWorkflowStatusId(fields.status.name),
      external_id: issue.key,
      story_type: jiraIssueTypeToClubhouseStoryTypeMapping[fields.issuetype.name],
      epic_id: this.getClubhouseEpicIdFromJiraEpicKey(fields[JIRA.EPIC_REF_CUSTOM_FIELD]),
      requested_by_id: this.getClubhouseUserIdFromJiraUsername(fields.creator),
      owner_ids: fields.assignee ? [this.getClubhouseUserIdFromJiraUsername(fields.assignee)] : undefined,
      estimate: fields[JIRA.ESTIMATE_CUSTOM_FIELD] ? Math.round(fields[JIRA.ESTIMATE_CUSTOM_FIELD]) : undefined,
      labels: labels,
      file_ids: fields.attachment.map(jiraFile => this.existingChFiles[jiraFile.id].id),
      comments: fields.comment.comments.map(jiraComment => ({
        author_id: this.getClubhouseUserIdFromJiraUsername(jiraComment.author),
        created_at: jiraComment.created,
        updated_at: jiraComment.updated,
        // replacing jira user references like [~christian] with @christian-clubhouse
        text: replaceUserReferencesInComment(jiraComment.body),
        external_id: jiraComment.id
      }))
    } as any;

    return story as any;
  }

  public async loadChStateAndLocalIssues() {

    console.log('fetch existing clubhouse projects');
    this.existingProjectsByKey = _.keyBy(await this.clubhouse.listProjects(), project => project.external_id);

    console.log(`fetch existing clubhouse files`);
    this.existingChFiles = _.keyBy(await this.clubhouse.listFiles(), file => file.external_id);

    console.log('fetch existing clubhouse members');
    this.members = await this.clubhouse.listMembers();

    console.log('fetch existing clubhouse workflow mapping');
    const [initialWorkFlow] = await this.clubhouse.listWorkflows();
    this.jiraIssieToChStatusIdMapping = createStateMapping(initialWorkFlow.states);

    console.log('fetch existing clubhouse stories');
    this.existingStoriesByKey = _.keyBy(await this.clubhouse.searchStories({archived: false}), story => story.external_id);
    console.log(`fetched ${Object.keys(this.existingStoriesByKey).length} existing clubhouse stories`);

    console.log('fetch existing clubhouse epics');
    this.existingEpicsByKey = _.keyBy(await this.clubhouse.listEpics(), epic => epic.external_id);

    console.log('load jira projects from file');
    this.jiraProjects = require('../data/projects.json') as JiraProject[];
    console.log('load jira issues from file');
    this.jiraIssues = require('../data/issues.json') as Issue[];
    this.jiraIssuesByKey = _.keyBy(this.jiraIssues, issue => issue.key);

  }

  public async migrateUsers() {

    let jiraUsers = require('../data/users.json') as User[];

    const cookieAxios = axios.create({
        headers: CLUBHOUSE_USER_SESSION_HEADERS
      }
    );

    console.log(`inviting ${jiraUsers.length} users`);

    const invites = (await cookieAxios.post(`https://api.clubhouse.io/api/beta/invites`, {emails: jiraUsers.map(getEmailForUser).join(',')})).data as any[];

    await Promise.each(invites, async (invite, index) => {
      let chUsername = jiraUserToClubhouseUsername(jiraUsers[index]);
      console.log(`creating user ${chUsername}`);

      return cookieAxios.post(`https://api.clubhouse.io/api/beta/invites/${invite.id}/create-user`, {
        name: jiraUsers[index].displayName,
        username: chUsername,
        password: CLUBHOUSE.ORG_USER_INITIAL_PASSWORD,
        password_confirm: CLUBHOUSE.ORG_USER_INITIAL_PASSWORD,
        product_updates: false
      }, {
        headers: {
          Cookie: ''
        }
      });
    });
  }

  public async migrateProjects() {
    console.log('creating projects if not yet exist');
    await Promise.map(this.jiraProjects, async jiraProject => {
      if (!this.existingProjectsByKey[jiraProject.key]) {
        console.log(`creating project: ${jiraProject.key}`);
        this.existingProjectsByKey[jiraProject.key] = await this.clubhouse.createProject(jiraProjectToClubhouseProject(jiraProject));
      } else {
        console.log(`skipping project: ${jiraProject.key}`)
      }
    });
  }

  public async migrateFiles() {

    console.log('migrating files');

    const attachments = _.flatten(this.jiraIssues.map(issue => issue.fields.attachment)) as Attachment[];

    const filesToUpload = attachments.filter(jiraFile => !this.existingChFiles[jiraFile.id]);

    console.log(`${filesToUpload.length} files to upload.`);

    let fileSuccess = 0;

    await Promise.map(filesToUpload, async jiraFile => {
      console.log(`downloading file ${jiraFile.filename}`);
      const fileStream = request.get(jiraFile.content, {
        auth: {
          user: JIRA.CREDENTIALS.user,
          pass: JIRA.CREDENTIALS.password
        }
      });

      console.log(`uploading file ${jiraFile.filename}`);

      const formData = new FormData();
      formData.append('file', fileStream);
      const uploadedFile = (await axios.post(`https://api.clubhouse.io/api/beta/files`, formData, {
        headers: formData.getHeaders(),
        params: {
          token: CLUBHOUSE.API_TOKEN
        }
      })).data[0] as File;

      await this.clubhouse.updateFile(uploadedFile.id, {
        external_id: jiraFile.id,
        name: jiraFile.filename,
        updated_at: jiraFile.created,
        uploader_id: this.getClubhouseUserIdFromJiraUsername(jiraFile.author)
      });

      this.existingChFiles[jiraFile.id] = uploadedFile;
      console.log(`upload of file: ${jiraFile.filename} completed.`);
      fileSuccess++;
      console.log(`file upload progress: ${fileSuccess} / ${filesToUpload.length} files.`);
    }, {concurrency: 1});
  }

  public async migrateEpics() {
    const epics = this.jiraIssues.filter(isEpic) as JiraEpic[];

    await Promise.map(epics as JiraEpic[], async jiraEpic => {
      if (!this.existingEpicsByKey[jiraEpic.key]) {
        console.log(`creating epic: ${jiraEpic.fields[JIRA.EPIC_TITLE_CUSTOM_FIELD]}`);
        const newEpic = this.jiraEpicToClubhouseEpic(jiraEpic);
        this.existingEpicsByKey[jiraEpic.key] = await this.clubhouse.createEpic(newEpic);
      } else {
        console.log(`skipping epic: ${jiraEpic.key}`)
      }
    });
  }

  public async migrateIssues() {

    const regularIssues = this.jiraIssues.filter(_.negate(isEpic)) as JiraRegularIssue[];

    await Promise.map(regularIssues as JiraRegularIssue[], async issue => {
      if (!this.existingStoriesByKey[issue.key]) {
        const newStory = this.jiraIssueToClubhouseStory(issue);
        console.log(`creating story: ${newStory.name}`);
        let story = await this.clubhouse.createStory(newStory);
        this.existingStoriesByKey[story.external_id] = story;

      } else {
        console.log(`skipping story: ${issue.key}`)
      }
    }, {concurrency: 10});
  }

  public async migrateIssueLinks() {

    console.log('creating missing story links');

    const existingChLinks = _.flatten(Object.values(this.existingStoriesByKey).map(story => story.story_links)) as StoryLink[];
    const storiesByChId = _.mapKeys(this.existingStoriesByKey, story => story.id);

    Array.from(existingChLinks.values())
      .map(link => computeLinkDeduplicationKey({
        inwardKey: storiesByChId[link.object_id].external_id,
        outwardKey: storiesByChId[link.subject_id].external_id
      }))
      .forEach(linkDeduplicationKey => this.existingLinkDeduplicationKeys.add(linkDeduplicationKey));

    const linksToCreate = determineLinksToCreate(this.jiraIssues.filter(_.negate(isEpic)), this.existingLinkDeduplicationKeys);

    await Promise.map(linksToCreate, (issueLinkInfo: IssueLinkInfo) => {
        const subjectStory = this.existingStoriesByKey[issueLinkInfo.inwardKey];
        const objectStory = this.existingStoriesByKey[issueLinkInfo.outwardKey];

        console.log(`creating story link: ${issueLinkInfo.inwardKey} ${issueLinkToStoryLinkMapping[issueLinkInfo.type]} ${issueLinkInfo.outwardKey}`);
        if (!subjectStory || !objectStory) {
          if (!subjectStory) {
            console.warn(`missing subject in story link: ${issueLinkInfo.inwardKey} ${issueLinkInfo.type} ${issueLinkInfo.outwardKey}`);
          }
          if (!objectStory) {
            console.warn(`missing object in story link: ${issueLinkInfo.inwardKey} ${issueLinkInfo.type} ${issueLinkInfo.outwardKey}`);
          }
          return;
        }

        let clubhouseStoryLink = {
          verb: issueLinkToStoryLinkMapping[issueLinkInfo.type],
          subject_id: subjectStory.id,
          object_id: objectStory.id
        } as any;
        return this.clubhouse.createStoryLink(clubhouseStoryLink).tapCatch(e => {
          console.error(`an occured while creating issuelink ${util.inspect(issueLinkInfo)}, clubhouseStoryLink: ${util.inspect(clubhouseStoryLink)} error: ${e.message}`);
          console.dir(e.response.data);
        });
      }, {
        concurrency: 1
      }
    );
    console.log('completed migration of issue links');
  }

  public async archiveOldLabels() {
    console.log('archiving labels of old sprints etc.');
    const existingLabels = await this.clubhouse.listLabels();
    await Promise.map(Array.from(this.labelsToArchive), async labelToArchive => {
      console.log(`archiving label: ${labelToArchive}`);
      const label = existingLabels.find(label => label.name === labelToArchive);
      await this.clubhouse.updateLabel(label.id, {archived: true});
    });
    console.log('completed archiving of old labels');
  }

  public async updateJiraWithLinksToClubhouse() {
    console.log('updating jira issues and epics with clubhouse link...');

    await Promise.map(Object.entries(this.existingStoriesByKey), ([jiraKey, chStory]) => {
      console.log(`updating jira issue: ${jiraKey} with link to clubhouse story: ${chStory.id}`);
      const jiraIssue = this.jiraIssuesByKey[jiraKey];
      if (!jiraIssue) {
        console.error(`could not find jira issue with key: ${jiraKey}. skipping clubhouse story: ${chStory.id}`);
        return;
      }
      return jiraApi.updateIssue(jiraKey, {
        fields: {
          description: `moved to clubhouse: https://app.clubhouse.io/${CLUBHOUSE.ORG}/story/${chStory.id}\n\n${jiraIssue.fields.description || ''}`
        }
      })
    }, {concurrency: 1});

    await Promise.map(Object.entries(this.existingEpicsByKey), ([jiraKey, chEpic]) => {
      console.log(`updating jira epic: ${jiraKey} with link to clubhouse epic: ${chEpic.id}`);
      const jiraIssue = this.jiraIssuesByKey[jiraKey];
      if (!jiraIssue) {
        console.error(`could not find jira epic with key: ${jiraKey}. skipping clubhouse epic: ${chEpic.id}`);
        return;
      }
      return jiraApi.updateIssue(jiraKey, {
        fields: {
          description: `moved to clubhouse: https://app.clubhouse.io/${CLUBHOUSE.ORG}/epic/${chEpic.id}\n\n${jiraIssue.fields.description || ''}`
        }
      })
    }, {concurrency: 1});
  }
}


function determineLinksToCreate(issues: JiraRegularIssue[], existingLinkDeduplicationKeys: Set<string>): IssueLinkInfo[] {

  const partialLinks = new Map<string, IssueLinkInfo>();
  const linksToCreate: IssueLinkInfo[] = [];

  issues.forEach(issue => {

    // collect regular jira issue links
    if (issue.fields.issuelinks) {
      issue.fields.issuelinks.forEach(issueLink => {

        let issueLinkInfo: IssueLinkInfo = partialLinks.get(issueLink.id);
        if (!issueLinkInfo) {
          issueLinkInfo = {type: IssueLinkTypeEnum[issueLink.type.name]};
          partialLinks.set(issueLink.id, issueLinkInfo);
        }

        if (issueLink.inwardIssue) {
          issueLinkInfo.inwardKey = issueLink.inwardIssue.key;
        }

        if (issueLink.outwardIssue) {
          issueLinkInfo.outwardKey = issueLink.outwardIssue.key;
        }

        if (issueLinkInfo.inwardKey && issueLinkInfo.outwardKey) {
          const key = computeLinkDeduplicationKey(issueLinkInfo);
          if (!existingLinkDeduplicationKeys.has(key)) {
            existingLinkDeduplicationKeys.add(key);
            linksToCreate.push(issueLinkInfo);
            partialLinks.delete(issueLink.id);
          }
        }
      });
    }

    // jira also has the notion of subtasks, which clubhouse does not. hence for every subtask we will just create a "relates to" link to it's parent
    if (issue.fields.parent) {
      const linkCandidate = {
        type: IssueLinkTypeEnum.Relates,
        inwardKey: issue.key,
        outwardKey: issue.fields.parent.key
      };

      const key = computeLinkDeduplicationKey(linkCandidate);

      if (!existingLinkDeduplicationKeys.has(key)) {
        existingLinkDeduplicationKeys.add(key);
        linksToCreate.push(linkCandidate);
      }
    }
  });

  return linksToCreate;
}

export default new Migration();
