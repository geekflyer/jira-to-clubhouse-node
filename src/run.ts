import 'core-js/shim';

global.Promise = require('bluebird');
Promise.config({
  longStackTraces: true
});

export default async function run(runSequence: (...any) => Promise<any>) {
  try {
    await runSequence();
  }

  catch (e) {
    if (e.response && e.response.data) {
      console.dir(e.response.data, {depth: 3});
      console.dir(e.response.headers);
    }
    throw e;
  }

  console.log('done');

}

