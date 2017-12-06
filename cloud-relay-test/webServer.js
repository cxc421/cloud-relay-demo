var fs = require('fs');
var path = require('path');
var http = require('http');
// var httpProxy = require('http-proxy');
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var uaParser = require('ua-parser-js');
const formidable = require('formidable');
var logger = require("morgan");
var uuid = require('uuid');
const WebSocket = require('ws');
// var formidable = require('formidable');
// var util = require('./lib/util');
const LOGIN_EXPIRE_TIME = 311040000000;
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, "public");
// const UPLOAD_FOLDER_PATH = path.resolve(__dirname, 'web_upload');
const { WEB_SERVER_PORT } = require('./config.json');
const { WS_PROTOCOL } = require('./constants.js');
// const WEB_SERVER_PORT = 8080;
// const WS_PROTOCOL = {
//   HTTP: 'WS_PROTOCOL/HTTP',
//   P2P : 'WS_PROTOCOL/P2P'
// };

// try {
//   fs.accessSync(UPLOAD_FOLDER_PATH);
// }
// catch(e) {
//   fs.mkdirSync(UPLOAD_FOLDER_PATH);
// }

(function() {
  const app = express();

  // cookie-parser & body-parser
  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  //public static files
  app.use(express.static( PUBLIC_FOLDER_PATH )); 

  // cgi
  // app.get('/test_cookie', onCookieGet);
  // app.get('/clear_cookie', onClearCookieGet);
  // app.post('/upload', onFileUpload);
  // app.post('/test_post', onTestPost);
  app.all('/test/add', onRequestTestAdd);

  // 404 not found
  app.use( onRequestNotFound );

  // start server
 const server = http.createServer(app);
 // const handleProtocols = (protocols, req) => {
 //  console.log('New protocols:', protocols);
 //  if (protocols[0] === 'web_liquid_info') {
 //    return protocols[0];
 //  }
 //  console.error('Wrong WebSocket protocol = ' + protocols[0]);
 //  return false;  
 // };
 // const wss = new WebSocket.Server({ server, handleProtocols }); 
 // wss.on('connection', (ws, req) => {
 //  console.log('New Websocket Connected!');
 //  ws.on('message', (message) => console.log('Message received:' + message));
 //  ws.on('close', () => console.log('WebSocket Close.'));
 //  ws.send('Msg from NVR -- 192.168.6.191');
 // });
 // wss.on('error', (error) => console.error('[wss] Error! ' + error.message));

 server.listen(WEB_SERVER_PORT, () => console.log(`Listening on ${ server.address().port }`));
})();

function onRequestTestAdd(req, res) {
  const {a, b} = getReqParam(req);  
  if (isNaN(a) || isNaN(b)) {
    return res.json({
      code: -1,
      msg: `Invalid parameters, a=${a}, b=${b}`
    });
  }
  res.json({
    code: 0,
    msg: 'Success',
    output: ((+a) + (+b))
  });
}

function getReqParam (req) {  
  var obj, prop, val;
  switch( req.method ) {
    case 'GET':
      obj = req.query;
    break;
    case 'POST':
      obj = req.body;
    break;
    default:
      obj = {};
  }
  for (prop in obj) {
    val = obj[prop];
    if ( val[0] && val[0] !== '0' && !isNaN( val ) ) {
      obj[prop] = +val;
    }
  }
  return obj;
};

function onRequestNotFound(req, res) {
  res.status(404).send('404 files not found.');
}