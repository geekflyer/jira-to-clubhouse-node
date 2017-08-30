import run from './run';
import { downloadAllProjects, downloadAllIssues, downloadAllUsers } from './jira/jira-extraction';
import migration from './Migration';
import clubhousePurger from './clubhouse/ClubhousePurger';

export enum Step {
  downloadJira = 'downloadJira',
  migrateUsers = 'migrateUsers',
  purgeClubhouse = 'purgeClubhouse',
  migrateData = 'migrateData',
  updateJiraIssues = 'updateJiraIssues'
}

const help = {
  [Step.downloadJira]: 'Downloads all data from jira and puts it into the `data` directory',
  [Step.migrateUsers]: 'Creates clubhouse users for each user in the `data/users.json` file',
  [Step.purgeClubhouse]: 'Deletes all clubhouse data, except for users',
  [Step.migrateData]: 'Migrates all projects, issues, epics etc. except for users',
  [Step.updateJiraIssues]: `Updates all Jira issues with a link to it's corresponding clubhouse issue. IMPORTANT: Run this only after all the other steps have been completed successfully and all your data is in clubhouse.`
};

const step = process.argv[2];

function printHelp() {
  console.log('please specify one of the following commands:');
  Object.entries(help).forEach(([step, desc]) => {
    console.log(`  ${step} - ${desc}`);
  });
}

if (!Object.values(Step).includes(step)) {
  printHelp();
} else {
  run(async function () {
    // download jira data and store it under ./data
    if (step === Step.downloadJira) {
      await downloadAllUsers();
      await downloadAllProjects();
      await downloadAllIssues();
    } else if (step === Step.migrateUsers) {
      // migrate users
      await migration.migrateUsers();
    } else if (step === Step.purgeClubhouse) {
      // cleanup clubhouse org completely (except for users)
      await clubhousePurger.purgeOrg();
    } else if (step === Step.migrateData) {

      // migrate jira data to clubhouse
      await migration.loadChStateAndLocalIssues();
      await migration.migrateProjects();
      await migration.migrateFiles();
      await migration.migrateEpics();
      await migration.migrateIssues();
      await migration.migrateIssueLinks();
      await migration.archiveOldLabels();
    } else if (step === Step.updateJiraIssues) {
      // update jira issues with link to clubhouse stories
      await migration.updateJiraWithLinksToClubhouse();
    }
  });
}



