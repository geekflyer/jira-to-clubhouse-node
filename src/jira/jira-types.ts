import { JiraIssueStatus } from '../../config';

export interface JiraBaseEntity {
  id: string;
  self: string;
}

export enum IssueType {
  Task = 'Task',
  Bug = 'Bug',
  Subtask = 'Sub-task',
  Epic = 'Epic',
  Story = 'Story'
}
export interface IssueLinkType extends JiraBaseEntity {
  name: string;
}

export enum IssueLinkTypeEnum {
  Duplicate = 'Duplicate',
  Relates = 'Relates',
  Cloners = 'Cloners',
  Blocks = 'Blocks'
}

export interface IssueLink extends JiraBaseEntity {
  type: IssueLinkType;
  outwardIssue: Issue;
  inwardIssue: Issue;
}

export interface User extends JiraBaseEntity {
  self: string;
  name: string;
  key: string;
  emailAddress: string;
  displayName: string;
}

export interface Comment extends JiraBaseEntity {
  author: User;
  body: string;
  created: string;
  updated: string;
}

export interface JiraBaseFields {
  summary: string;
  description: string;
  issuetype: {
    id: string;
    self: string;
    name: IssueType;
  };
  project: {
    id: string;
    self: string;
    key: string;
  };
  created: string;
  updated: string;
  assignee: User;
  creator: User;
  status: {
    self: string;
    name: JiraIssueStatus;
  };
  subtasks: any[];
  comment: {
    comments: Comment[];
  };
  issuelinks: null | IssueLink[],
  parent?: JiraRegularIssue;
  attachment: Attachment[],
  watchers: null | User[]
}


export interface Attachment {
  id: string;
  filename: string;
  author: User;
  created: string;
  content: string;
}

export interface JiraBaseIssue extends JiraBaseEntity {
  key: string; // i.e. "CI-221"
}

export interface RegularIssueFields extends JiraBaseFields {
  //contains Release information
  fixVersions: IJiraRelease[],
  [customFieldId: string]: any;
}

export interface IJiraRelease extends JiraBaseEntity {
  name: string;
  description: string;
  releaseDate: string;
}

export interface JiraRegularIssue extends JiraBaseIssue {
  fields: RegularIssueFields;
}

export interface EpicFields extends JiraBaseFields {
  [customFieldId: string]: any;
}

export interface JiraEpic extends JiraBaseIssue {
  fields: EpicFields;
  // this is the actual issue name, for some strange reason this is a custom field
}

export type Issue = JiraEpic | JiraRegularIssue;

export interface JiraProject extends JiraBaseEntity {
  key: string // eg. "CI"
  name: string // eg. "Core Intelligence"
}
