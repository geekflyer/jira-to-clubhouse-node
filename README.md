jira-to-clubhouse-node
======================

Tool / script to migrate all your data from JIRA to clubhouse.io.

### What does it migrate / how does it work?

The tool downloads all issues, epics, projects and users from a JIRA API and stores it in local `.json` files.
Afterwards it uploads all the data to clubhouse.io by using the clubhouse API (it also uses some inofficial clubhouse APIs to migrate users).
**It aims to migrate almost every concept that is typically used in JIRA Software (aka Agile) automatically**, so that your organization will have a very seamless and easy transition.
It was used successfully for a migration of 1300 issues, 50 epics, 30 users, 160 files and took ~15 minutes to migrate all the data.

### State / Maturity

The tool is in early stage and needs better documentation and testing with multiple jira setups, but was already successfully used for a real and successful migration.
For most people outside of clubhouse inc. (incl. me) a migration for jira to clubhouse is probably a once in a lifetime activity, so expect not too much dev activity around this tool - hopefully at some point in time clubhouse develops an official tool or uses this as a foundation.
Support is as needed (open an github issue or create your own PR). Also I very welcome any feedback (positive and negative) as github issue.
The documentation will be improved a bit once I have some time.

### How to use it?

#### Prerequesites

- You need to have node.js 8.x or higher with npm@5 or higher installed.
- You need a jira user with access to all issues
- You need a clubhouse admin user
- Ideally you should create a clubhouse test org and run the migration a few times there for testing (name the org "yourcompany-dev1" for example), until you create another *production* clubhouse org

#### Steps

1. Run the following commands on your machine
```sh
git clone https://github.com/geekflyer/jira-to-clubhouse-node.git
npm install
```
1. Create a copy of `config.template.ts` and name it `config.ts`
1. Fill in all the required configuration in `config.ts`, in particular the jira and clubhouse credentials.
   Note: besides some obvious things like username and password of jira and clubhouse api token, you also have to provide the clubhouse organization id and a session cookie if you want to automatically migrate users instead of manually creating them.
   This is because clubhouse has currently no official API for user creation and in order to use the inofficial API we have to use cookie based authentication etc.
   You can also modify workflow state mappings at the bottom of the file if your jira or clubhouse instance uses lots of custom states.
1. Run `npm start downloadJira`
1. Run `npm start migrateUsers`
1. Run `npm start migrateData`
1. If all the above steps are successfully completed and you want to update your jira issues with a link to it's new clubhouse story, run also `npm start updateJiraIssues`
1. Enjoy clubhouse.io :-)

### Supported entities to migrate

It supports fully automated migration of the following jira concepts to clubhouse concepts:

- **[Jira Concept]** -> **[Clubhouse Concept]**
- project -> project
- issue -> story (incl. comments, requester, owner etc, support for custom issue status types)
- issue attachment (pics, files etc.) -> story file
- issue link -> story link
- epic -> epic (incl. comments, requester, owner etc.)
- user -> user
- hierarchical issue relationship (parent / child issues) -> "relates to" story link
- sprint -> label with the same name as the sprint
- Story points -> Estimate
- Release / fixVersions -> label with the name `Release-<Release_Date>-<Release_Name>`

### Additional Features

For further convenience it has the following additional features:

- Inline description and comment mentions of users in jira syntax [~someuser] can be replaced with clubhouse syntax `@some-user-in-clubhouse` mentions.
- To the bottom of each clubhouse story and epic a link to it's original jira item is added.
- Once the migration to clubhouse is completed, it can update all jira items and add a link in jira which points to the equivalent migrated story / epic in clubhouse.
(so basically jira issues will contain a link to their clubhouse story and vice-versa)
- each migrated issue / epic is labeld with `JIRA`
- if something goes wrong it has the ability to purge your entire clubhouse org and start from scratch (except for users)

### Limitations

It is only tested with JIRA Software (aka Agile) in JIRA Cloud. It may not work with other Jira versions or variants properly, but you can try.

### Comparison to Alternatives

There is a tool https://github.com/t3db0t/jiraToClubhouseCLI which has the same purpose, however it's scope and capabilities are much smaller:
- it makes the implicit assumption that each user is assigned to only a single project, which is not true in many companies
- it cannot auto-migrate many entities, incl. users, projects, attachments, issue relationships, sprints, story points, releases
- it requires you to manually download an XML file from jira instead of downloading the issues automatically via the jira API
