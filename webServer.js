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
const UPLOAD_FOLDER_PATH = path.resolve(__dirname, 'web_upload');
const { WEB_SERVER_PORT } = require('./config.json');
const { WS_PROTOCOL } = require('./constants.js');

try {
  fs.accessSync(UPLOAD_FOLDER_PATH);
}
catch(e) {
  fs.mkdirSync(UPLOAD_FOLDER_PATH);
}

function onFileUpload(req, res) {
  //check type is correct
  var type = req.headers['content-type'] || '';
  var isFormData = 0 === type.indexOf('multipart/form-data');
  if( !isFormData ) {
    res.status(400).end();
  }
  //start upload files
  var form = new formidable.IncomingForm();
  form.uploadDir =  UPLOAD_FOLDER_PATH;
  form.keepExtensions = true;
  form.on('file', function(field, file) {
      //rename the incoming file to the file's name
      if( file.name  ){
        fs.rename(file.path, form.uploadDir + "/" + file.name);
      }        
  });
  form.parse(req, function(err, fields, files){
    console.log('Uplaod Complete!');
    // res.status(204).end();
    res.json({
      code: 0,
      msg: 'Upload Success'
    });
  });
  form.on('progress', function(bytesRecv, bytesExpect){
    var percent = Math.floor(bytesRecv/bytesExpect*100);
    console.log(percent);
  });
}

function onTestPost(req, res) {
  const parms = getReqParam(req);
  let resData = {
    code: 0,
    msg: 'success'
  };
  for (let prop in parms) {
    resData[prop] = parms[prop];
  }
  res.json(resData);
}

function onRequestNotFound(req, res) {
	res.status(404).send('404 files not found.');
}

function getReqParam(req) {  
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
}

(function() {
	const app = express();
	// logger
	// app.use(logger('short'));

	// cookie-parser & body-parser
	app.use(cookieParser());
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({extended: false}));
  // app.use((req, res, next) => {
  //   console.log('=========================');
  //   console.log(req.cookies);
  //   next();
  // });

  //public static files
  app.use(express.static( PUBLIC_FOLDER_PATH )); 

	// cgi
  app.get('/test_cookie', onCookieGet);
  app.get('/clear_cookie', onClearCookieGet);
	app.post('/upload', onFileUpload);
  app.post('/test_post', onTestPost);
	// app.all("/sdp/register", registerSDP);
	// app.all("/sdp/query", querySDP);
	// app.all("/sdp/unregister", unregisterSDP);	
	// app.all('/sdp/set_expired_interval', setExpiredInterval);

	// 404 not found
	app.use( onRequestNotFound );

	// start server
	// http.createServer(app).listen(WEB_SERVER_PORT); 		
 //  console.log('listening on port: ' + WEB_SERVER_PORT);
 const server = http.createServer(app);
 const handleProtocols = (protocols, req) => {
  console.log('New protocols:', protocols);
  if (protocols[0] === 'web_liquid_info') {
    return protocols[0];
  }
  console.error('Wrong WebSocket protocol = ' + protocols[0]);
  return false;  
 };
 const wss = new WebSocket.Server({ server, handleProtocols }); 
 wss.on('connection', (ws, req) => {
  console.log('New Websocket Connected!');
  ws.on('message', (message) => console.log('Message received:' + message));
  ws.on('close', () => console.log('WebSocket Close.'));
  ws.send('Msg from NVR -- 192.168.6.191');
 });
 wss.on('error', (error) => console.error('[wss] Error! ' + error.message));

 server.listen(WEB_SERVER_PORT, () => console.log(`Listening on ${ server.address().port }`));
})();

function onCookieGet(req, res) {  
  console.log('=================');
  // console.log(req.cookies);
  // console.log(req.cookies['client-cookie']);
  console.log(req.headers.cookie);

  let nvrCookieVal = 'Unknow';
  if (req.cookies['client-cookie']) {
    nvrCookieVal = req.cookies['client-cookie'];
  }

  res.cookie('nvr-cookie', nvrCookieVal, { maxAge: LOGIN_EXPIRE_TIME, httpOnly: true });
  res.json({
    code: 0,
    msg: 'Set cookie Success!'
  });
}

function onClearCookieGet(req, res) {
  res.clearCookie('nvr-cookie', { maxAge: 1, httpOnly: true });
  res.json({
    code: 0,
    msg: 'Clear cookie Success!'    
  });
}