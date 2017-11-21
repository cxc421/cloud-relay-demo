const express = require('express');
const http = require('http');
const url = require('url');
const path = require('path');
const WebSocket = require('ws');
const normalizeHeaderCase = require("header-case-normalizer");
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, "public");
const app = express();
let globalWs = null;
let globalRes = null;


//public static files
app.use(express.static( PUBLIC_FOLDER_PATH )); 
app.use(onGetFile);
app.use(onRequestNotFound);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const counter = {
  idx: 0,
  get: function() {
    return this.idx++;
  }
};


let tmpData = null;
wss.on('connection', function connection(ws, req) {
  ws['__counter'] = counter.get();

  console.log('New WwbSocket-' + ws['__counter'] + ' Connection!');
  ws.on('message', function incoming(message) {
    // console.log('\nreceived: %s', message);
    try {
      let data = JSON.parse(message);
      tmpData = data;
    }
    catch(e) {
      let data = tmpData;
      let body = message;
      const {statusCode, headers} = data;
      console.log('\nstatusCode:' + statusCode);
      console.log('headers:');
      console.log(headers);
      console.log('typeof body: ' + (typeof body));      

      let headerObj = {};
      for (let prop in headers) {
        headerObj[ normalizeHeaderCase(prop) ] = headers[prop];
      }
      globalRes.writeHead( statusCode, headerObj );
      let dataString = "data:" + headers["content-type"] + ";base64," + new Buffer(body).toString('base64');
      globalRes.write( dataString );
      // globalRes.write( new Buffer(body).toString('base64') );
      globalRes.end();
    }
  });  
  ws.on('close', () => {
    console.log('WebSocket-' + ws.__counter + ' Close!');
    globalWs = null;
  });
  globalWs = ws;

});

server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
});

function onRequestNotFound(req, res) {
  res.status(404).send('404 files not found.');
}

function onGetFile(req, res, next) {
  if (req.url.indexOf('ico') >= 0) {
    return next();
  }
  console.log('\n=============================================');
  console.log(req.url);
  console.log(req.method);
  console.log(req.headers);  
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify({
      url    : req.url,
      method : req.method,
      headers: req.headers
    }));
    globalRes = res;
  }  
  else {
    next();
  }
}

