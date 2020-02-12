import { User } from './src/jira/jira-types';
import { EpicStates } from 'clubhouse-lib/build/types';

export const JIRA = {
  get BASE_URL() { return this.PROTOCOL + '://' + this.HOST},
  PROTOCOL: 'https',
  HOST: 'mycompany.atlassian.net',
  CREDENTIALS: {
    user: 'myjirauser@mycompany.com',
    password: 'myjirapassword'
  },
  // sprint estimates
  ESTIMATE_CUSTOM_FIELD: 'customfield_10105',
  // this field has the sprint information encoded. it contains an array of strings where each string has information a the sprint this item is associated with. (an issue can be associated with multiple sprints)
  // we will just search for `name=<sprint_name>` to create according cluhouse labels (label=<sprint_name>)
  SPRINTINFO_CUSTOM_FIELD: 'customfield_10103',
  //reference to an epic as key e.g.: `PLAT-76`
  EPIC_REF_CUSTOM_FIELD: 'customfield_10006',
  EPIC_TITLE_CUSTOM_FIELD: 'customfield_10003',
  RETRIEVE_WATCHERS: false,
};

export const CLUBHOUSE = {
  // clubhouse api token
  API_TOKEN: '59t22e5f-4c63-4f7c-b434-ef49f6f4f3dc',
  ORG: 'myorg',
  ORG_USER_SUFFIX: '-myorg',
  ORG_USER_INITIAL_PASSWORD: 'initialpasswordforallusers',
  // required for user migration. Just copy it from any POST / PUT call in chrome dev tools network tab while logged in to clubhouse. You simply have to copy the content of the `Cookie` header.
  // TODO: better docs
  SESSION_COOKIE: 'ajs_anonymous_id=%2257e732183-f1a2-4d50-babc-62b6b212d0786%22; clubhouse-session=59a1422d8f-fd69-43fb-9ac8-f74dc24245180a; ajs_group_id=null; _ga=GA1.2.2629430817.1505897866; _gid=GA1.2.8964972652.115058973866; ajs_user_id=%22594917e8a-070a-4559-972b1-18d3a12a6bb8be%22',
  // can be retrieved from `Clubhouse-Organization` request header when logged into clubhouse. required for user migration
  ORGANIZATION_ID: '524971e8a-0959-4233-148af-9f2413486e35',
};

export function jiraUserToClubhouseUsername(jiraUser: User) {
  return jiraUser.key + '-' + CLUBHOUSE.ORG_USER_SUFFIX;
}

export function getEmailForUser(jiraUser: User) {
  // you should setup the clubhouse users with some fake email or your own email + some suffix (gmail etc.) initially, since this avoids some trouble with conflicting users in your production vs dev clubhouse org
  // TODO - add better explanation on why this is useful
  return `myawesomemail+ch+${CLUBHOUSE.ORG}_${jiraUser.key}@gmail.com`;
}

export function replaceUserReferencesInComment(comment: string) {
  return comment.replace(/\[~(.+?)]/g, `@$1${CLUBHOUSE.ORG_USER_SUFFIX} `);
}

export enum JiraIssueStatus {
  ToDo = 'To Do',
  InProgress = 'In Progress',
  InReview = 'In Review',
  UnderReview = 'Under Review',
  Done = 'Done',
  Live = 'Live'
}

export enum ClubhouseStandardWorkFlowState {
  Unscheduled = 'Unscheduled',
  ReadyForDevelopment = 'Ready for Development',
  InDevelopment = 'In Development',
  ReadyForReview = 'Ready for Review',
  ReadyForDeploy = 'Ready for Deploy',
  Completed = 'Completed'
}

export const jiraToClubhouseStateMapping: { [jiraState: string]: ClubhouseStandardWorkFlowState } = {
  [JiraIssueStatus.ToDo]: ClubhouseStandardWorkFlowState.Unscheduled,
  [JiraIssueStatus.InProgress]: ClubhouseStandardWorkFlowState.InDevelopment,
  [JiraIssueStatus.InReview]: ClubhouseStandardWorkFlowState.ReadyForReview,
  [JiraIssueStatus.UnderReview]: ClubhouseStandardWorkFlowState.ReadyForReview,
  [JiraIssueStatus.Done]: ClubhouseStandardWorkFlowState.Completed,
  [JiraIssueStatus.Live]: ClubhouseStandardWorkFlowState.Completed
};

export const jiraEpicToChEpicStateMapping: { [jiraState: string]: EpicStates } = {
  [JiraIssueStatus.ToDo]: 'to do',
  [JiraIssueStatus.InProgress]: 'in progress',
  [JiraIssueStatus.InReview]: 'in progress',
  [JiraIssueStatus.UnderReview]: 'in progress',
  [JiraIssueStatus.Done]: 'done',
  [JiraIssueStatus.Live]: 'done'
};
