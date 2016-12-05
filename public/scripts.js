const talkSection = document.querySelector('#talks');
const nameField = document.querySelector('#name');
const talkForm = document.querySelector('#newtalk');
nameField.value = localStorage.getItem('name') || '';

let lastServerTime = 0;
let shownTalks = Object.create(null);

const request = (options, callback) => {
  let req = new XMLHttpRequest();
  req.open(options.method || 'GET', options.pathname, true);
  req.addEventListener('load', () => {
    req.status < 400 ? callback(null, req.responseText) :
      callback(new Error('Request failed: ' + req.statusText));
  });
  req.addEventListener('error', () => {
    callback(new Error('Network error'));
  });
  req.send(options.body || null);
};

const reportError = (error) => {
  if (error) {
    console.error(error);
  }
};

const instantiateTemplate = (name, values) => {
  const instantiateText = (text) => {
    return text.replace(/\{\{(\w+)\}\}/g, function(_, name) {
      return values[name];
    });
  };
  const instantiate = (node) => {
    if (node.nodeType == document.ELEMENT_NODE) {
      let copy = node.cloneNode();
      for (let i = 0; i < node.childNodes.length; i++) {
        copy.appendChild(instantiate(node.childNodes[i]));
        return copy;
      }
    }
    else if(node.nodeType == document.TEXT_NODE) {
      return document.createTextNode(
        instantiateText(node.nodeValue)
      );
    }
    else {
      return node;
    }
  };
  let template = document.querySelector('#template .' + name);
  return instantiate(template);
};

const drawTalk = (talk) => {
  let node = instantiateTemplate('talk', talk);
  let comments = node.querySelector('.comments');
  talk.comments.forEach((comment) => {
    comments.appendChild(
      instantiateTemplate('comment', comment)
    );
  });
};

const displayTalks = (talks) => {
  talks.forEach((talk) => {
    let shown = shownTalks[talk.title];
    if(talk.deleted) {
      if (shown) {
        talkSection.removeChild(shown);
        delete shownTalks[talk.title];
      }
      else {
        let node = drawTalk(talk);
        if (shown) {
          talkSection.replaceChild(node, shown);
        }
        else {
          talkSection.appendChild(node);
          shownTalks[talk.Title] = node;
        }
      }
    }
  });
};

const talkURL = (title) => {
  return 'talks/' + encodeURIComponent(title);
};

const deleteTalk = (title) => {
  request({ pathname: talkURL(title), method: 'DELETE'}, reportError);
};

const addComment = (title, comment) => {
  let commentObj = { author: nameField.value, message: comment};
  request({pathname: talkURL(title) + '/comments',
          body: (JSON.stringify(commentObj)),
          method: 'POST'},
          reportError);
};

const waitForChanges = () => {
  request({pathname: 'talks?changesSince=' + lastServerTime},
    (error, response) => {
      if(error) {
        setTimeout(waitForChanges, 2500);
        console.error(error.stack);
      }
      else {
        response = JSON.parse(response);
        displayTalks(response.talks);
        lastServerTime = response.serverTime;
        waitForChanges();
      }
    });
};

nameField.addEventListener('change', () => {
  localStorage.setItem('name', nameField.value);
});

talkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  request({pathname: talkURL(talkForm.elements.title.value),
            method: 'PUT',
            body: JSON.stringify({
              presenter: nameField.value,
              summary: talkForm.elements.summary.value
            })
        }, reportError);
  talkForm.reset();
});


request({pathname: 'talks'}, (error, response) => {
  if (error) {
    reportError(error);
  }
  else {
    response = JSON.parse(response);
    displayTalks(response.talks);
    lastServerTime = response.serverTime;
    waitForChanges();
  }
});
