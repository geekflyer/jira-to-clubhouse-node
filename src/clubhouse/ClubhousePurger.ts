import Clubhouse from 'clubhouse-lib';
import { CLUBHOUSE } from '../../config';

export class ClubhousePurger {

  constructor(public clubhouse = Clubhouse.create(CLUBHOUSE.API_TOKEN)) {}

  async purgeOrg() {
    await this.deleteAllStories();
    await this.deleteAllEpics();
    await this.deleteProjects();
    await this.deleteLabels();
    await this.deleteAllFiles();
  }


  async deleteAllStories() {
    const projects = await this.clubhouse.listProjects();
    const storySets = await Promise.all(projects.map(project => this.clubhouse.listStories(project.id)));

    const stories = [].concat(...storySets);

    return Promise.map(stories, story => {
      console.log(`deleting story: ${story.name}`);
      return this.clubhouse.deleteStory(story.id)
    }, {
      concurrency: 10
    });
  }

  async deleteAllEpics() {
    const epics = await this.clubhouse.listEpics();
    return Promise.each(epics, epic => {
      console.log(`deleting epic: ${epic.name}`);
      return this.clubhouse.deleteEpic(epic.id);
    });
  }

  async deleteProjects() {
    const projects = await this.clubhouse.listProjects();

    return Promise.each(projects, project => {
      console.log(`deleting project: ${project.name}`);
      return this.clubhouse.deleteProject(project.id);
    })
  }

  async deleteLabels() {
    const labels = await this.clubhouse.listLabels();

    return Promise.each(labels, label => {
      console.log(`deleting label: ${label.name}`);
      return this.clubhouse.deleteLabel(label.id);
    })
  }

  async deleteAllFiles() {
    const files = await this.clubhouse.listFiles();

    return Promise.each(files, file => {
      console.log(`deleting file: ${file.name}`);
      return this.clubhouse.deleteFile(file.id);
    })
  }
}

export default new ClubhousePurger();