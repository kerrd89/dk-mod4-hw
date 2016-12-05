'use strict';
const http = require('http');
const Router = require('./router');
const ecstatic = require('ecstatic');
const fileServer = ecstatic({ root: './public' });

let router = new Router();
let talks = Object.create(null);
let waiting = [];
let changes = [];

http.createServer((request, response) => {
  if(!router.resolve(request, response))
    fileServer(request, response);
}).listen(8000);

const respond = (response, status, data, type) => {
  response.writeHead(status, {
    'Content-Type': type || 'text/plain'
  });
  response.end(data);
};

const respondJSON = (response, status, data) => {
  respond(response, status, JSON.stringify(data), 'application/json');
};

const sendTalks = (talks, response) => {
  respondJSON(response, 200, {
    serverTime: Date.now(),
    talks
  });
};

const getChangedTalks = (since) => {
  let found = [];
  const alreadySeen = (title) => {
    return found.some((f) => f.title == title);
  };
  for (let i = changes.length -1; i >= 0; i--) {
    let change = changes[i];
    if (change.time <= since) {
      break;
    }
    else if (alreadySeen(change.title)) {
      continue;
    }
    else if (change.title in talks) {
      found.push(talks[change.title]);
    }
    else {
      found.push({ title: change.title, deleted: true });
    }
  }
};

const registerChange = (title) => {
  changes.push({ title, time: Date.now() });
  waiting.forEach((waiter) => {
    sendTalks(getChangedTalks(waiter.since), waiter.response);
  });
};

const readStreamAsJSON = (stream, callback) => {
  let data = '';
  stream.on('data', (chunk) => {
    data += chunk;
  });
  stream.on('end', () => {
    let result, error;
    try { result = JSON.parse(data); }
    catch (e) { error = e; }
    callback(error, result);
  });
  stream.on('error', (error) => {
    callback(error);
  });
};


const waitForChanges = (since, response) => {
  let waiter = { since, response };
  waiting.push(waiter);
  setTimeout(() => {
    let found = waiting.indexOf(waiter);
    if (found > -1) {
      waiting.splice(found, 1);
      sendTalks([], response);
    }
  }, 90 * 1000);
};

router.add('GET', /^\/talks\/([^\/]+)$/, (request, response, title) => {
  if(title in talks) {
    respondJSON(response, 200, talks[title]);
  }
  else {
    respond(response, 404, 'No talk \'' + title + '\' found');
  }
});

router.add('DELETE', /^\/talks\/([^\/]+)$/, (request, response, title) => {
  if (title in talks) {
    delete talks[title];
    registerChange(title);
  }
  respond(response, 204, null);
});

router.add('PUT', /^\/talks\/([^\/]+)$/, (request, response, title) => {
  readStreamAsJSON(request, (error, talk) => {
    if (error) {
      respond(response, 400, error.toString());
    }
    else if (!talk ||
               typeof talk.presenter != 'string' ||
               typeof talk.summary != 'string') {
      respond(response, 400, 'Bad talk data');
    }
    else {
      talks[title] = {title: title,
                      presenter: talk.presenter,
                      summary: talk.summary,
                      comments: []};
      registerChange(title);
      respond(response, 204, null);
    }
  });
});

router.add('POST', /^\/talks\/([^\/]+)\/comments$/, (request, response, title) => {
  readStreamAsJSON(request, (error, comment) => {
    if (error) {
      respond(response, 400, error.toString());
    } else if (!comment ||
               typeof comment.author != 'string' ||
               typeof comment.message != 'string') {
      respond(response, 400, 'Bad comment data');
    } else if (title in talks) {
      talks[title].comments.push(comment);
      registerChange(title);
      respond(response, 204, null);
    } else {
      respond(response, 404, 'No talk \'' + title + '\' found');
    }
  });
});

router.add('GET', /^\/talks$/, (request, response) => {
  let query = require('url').parse(request.url, true).query;
  if (query.changesSince == null) {
    let list = [];
    for (let title in talks)
      list.push(talks[title]);
    sendTalks(list, response);
  } else {
    let since = Number(query.changesSince);
    if (isNaN(since)) {
      respond(response, 400, 'Invalid Parameter');
    } else {
      let changed = getChangedTalks(since);
      if (changed.length > 0)
         sendTalks(changed, response);
      else
        waitForChanges(since, response);
    }
  }
