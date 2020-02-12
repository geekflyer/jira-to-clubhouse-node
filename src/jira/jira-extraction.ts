import * as fs from 'fs';
import jira from './jiraApi';
import { JIRA } from '../../config'; 
import { JiraRegularIssue } from './jira-types';

const ensureDataDirExists = () => {
  if (!fs.existsSync(__dirname + '/../../data')) {
    fs.mkdirSync(__dirname + '/../../data')
  }
};

export const downloadAllProjects = async () => {
  ensureDataDirExists();
  const allProjects = await jira.listProjects();
  fs.writeFileSync(__dirname + '/../../data/projects.json', JSON.stringify(allProjects, undefined, '\t'));
  console.log(`${allProjects.length} projects downloaded`);
};

export const downloadAllUsers = async () => {
  ensureDataDirExists();
  const allUsers = await jira.searchUsers({username: "%"});
  fs.writeFileSync(__dirname + '/../../data/users.json', JSON.stringify(allUsers, undefined, '\t'));
  console.log(`${allUsers.length} users downloaded`);
};

export const downloadAllIssues = async () => {
  ensureDataDirExists();
  let collectedIssues = [];

  while (true) {
    let startAt = collectedIssues.length;
    let response = await jira.searchJira('', {fields: ['*all'], "maxResults": 1000, "startAt": startAt});
    let issues = response.issues;
    if (JIRA.RETRIEVE_WATCHERS) {
      issues = await Promise.map(response.issues as JiraRegularIssue[], async issue => {
        let watchesUrl = issue.fields.watches.self;
        let watchesResponse = await jira.doRequest(jira.makeRequestHeader(watchesUrl));
        issue.fields.watchers = watchesResponse.watchers;
        return issue
      }, {concurrency: 10});
    }
    collectedIssues.push(...issues);
    console.log(`downloaded ${collectedIssues.length} / ${response.total} issues`);
    if (collectedIssues.length >= response.total) {
      break;
    }
  }

  fs.writeFileSync(__dirname + '/../../data/issues.json', JSON.stringify(collectedIssues, undefined, '\t'));
  console.log(`total of ${collectedIssues.length} issues downloaded.`)
};
