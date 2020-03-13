import * as fs from 'fs';
import jira from './jiraApi';

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
  const allUsers = await jira.searchUsers({ query: { displayName: "%" } });
  fs.writeFileSync(
    __dirname + "/../../data/users.json",
    JSON.stringify(allUsers, undefined, "\t")
  );
  console.log(`${allUsers.length} users downloaded`);
};

export const downloadAllIssues = async () => {
  ensureDataDirExists();
  let collectedIssues = [];

  while (true) {
    let startAt = collectedIssues.length;
    let response = await jira.searchJira('', {fields: ['*all'], "maxResults": 1000, "startAt": startAt});
    collectedIssues.push(...response.issues);
    console.log(`downloaded ${collectedIssues.length} / ${response.total} issues`);
    if (collectedIssues.length >= response.total) {
      break;
    }
  }

  fs.writeFileSync(__dirname + '/../../data/issues.json', JSON.stringify(collectedIssues, undefined, '\t'));
  console.log(`total of ${collectedIssues.length} issues downloaded.`)
};
