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
