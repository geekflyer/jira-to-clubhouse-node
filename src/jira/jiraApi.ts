import * as JiraApi from 'jira-client';
import { JIRA } from '../../config';

export default new JiraApi({
  protocol: JIRA.PROTOCOL,
  host: JIRA.HOST,
  username: JIRA.CREDENTIALS.user,
  password: JIRA.CREDENTIALS.password,
  apiVersion: '2',
  strictSSL: true
});