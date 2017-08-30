import { IssueLinkTypeEnum, IssueType } from './jira/jira-types';
import { StoryType } from 'clubhouse-lib';
import { StoryLinkVerb } from 'clubhouse-lib/build/types';

export const jiraIssueTypeToClubhouseStoryTypeMapping: { [jiraType: string]: StoryType } = {
  [IssueType.Story]: StoryType.Feature,
  [IssueType.Bug]: StoryType.Bug,
  [IssueType.Task]: StoryType.Chore,
  [IssueType.Subtask]: StoryType.Feature
};

export const issueLinkToStoryLinkMapping: { [issueLinkType: string]: StoryLinkVerb } = {
  [IssueLinkTypeEnum.Blocks]: 'blocks',
  [IssueLinkTypeEnum.Cloners]: 'relates to',
  [IssueLinkTypeEnum.Duplicate]: 'duplicates',
  [IssueLinkTypeEnum.Relates]: 'relates to'
};