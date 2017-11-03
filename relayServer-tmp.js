const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const uaParser = require('ua-parser-js');
const rimraf = require('rimraf');
const formidable = require('formidable');
const WebSocket = require('ws');
const uuid = require('uuid');

const app = express();
const { RELAY_SERVER_PORT } = require('./config.json');
const { CMD, RESULT } = require('./constants.js');
const resStore = {};
let globalWs = null;  // Assume only one relayClient !!!!!!

const UPLOAD_FOLDER_PATH = path.resolve(__dirname, "upload");
if (!fs.existsSync(UPLOAD_FOLDER_PATH)){
  fs.mkdirSync(UPLOAD_FOLDER_PATH);
}

(function() {
  // middleware
  app.use(cookieParser() );
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  // app.use(express.static( PUBLIC_FOLDER_PATH ));   

  // router
  app.post('/relay/upload', onUpload);
  app.use('/', onGetDefaultRequest);
  // app.use('/', makeNormalRequest);

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  wss.on('connection', function connection(ws, req) {
    // const location = url.parse(req.url, true);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
    console.log('New connection!');
    globalWs = ws;
    ws.on('message', onWebSocketMessage); 
    ws.on('close', onWebsocketClose);
    ws.on('open', onWebSocketOpen);
    // ws.send('something');
  });
  wss.on('error', error => {
      console.log('\n[wss] ERROR: ' + error.message + '\n');
  });

  server.listen(RELAY_SERVER_PORT, function listening() {
    console.log('Listening on %d', server.address().port);
  });
}());

function onGetDefaultRequest(req, res) {
  if (globalWs && globalWs.readyState == 1) {
    const uuid = genUUID();  
    const data = genDataToWs(req);
    resStore[uuid] = res;
    data['uuid'] = uuid;
    // console.log('\n=== send');
    // console.log(data);
    globalWs.send(JSON.stringify( data ));
  }
  else {
    res.status(500).end('WebSocket Not connected!');
  }
}

function genDataToWs(req) {
  const fileName = path.basename(req.path);
  const isFile = (fileName.indexOf('.') !== -1);     
  const method = req.method;

  if (isFile && method === 'GET') {  // Consider GET file first. !!!!!!
    return {
      cmd     : CMD.FILE_REQUEST,
      url     : req.originalUrl,
      // method  : method,
      fileName: fileName
    };
  }
  else {
    return {
      cmd        : CMD.NORMAL_REQUEST,
      httpVersion: req.httpVersion,
      headers    : req.headers,
      trailers   : req.trailers,
      method     : req.method,
      url        : req.originalUrl,
      body       : (method === 'POST' || method === 'PUT') ? JSON.stringify(req.body) : undefined
    };
  }
}

function onWebSocketMessage( data ) {
  // data = JSON.parse(data);
  // console.log('[wss]: received: %s', data.result);
  const replyData = JSON.parse(data);

  // console.log('\n=== received');
  // console.log(replyData);

  const {uuid, cmd} = replyData;
  const res = resStore[uuid];
  if (res === undefined) {
    //return console.error('\nError: Cached response disapper!!, data = %s\n', data);
    return console.error('\nError: Cached response disapper!!');
  }
  if (cmd === CMD.FILE_REQUEST) {
    processFileResponse(res, replyData);
  }
  else {
    processNormalResponse(res, replyData);
  }
  delete resStore[replyData.uuid];
}

function processFileResponse(res, replyData) {
  const { result, subFolder, fileName } = replyData;
  const folderPath = path.resolve(UPLOAD_FOLDER_PATH, String(subFolder) );
  const MAX_TRY_TIME = 1;
  let tryTime = 0;

  function _send () {
    const filePath = path.resolve(folderPath, fileName);
    fs.access(filePath, (err) => {    
      if (err) {        
        console.error(err.message);
        if (++tryTime < MAX_TRY_TIME) {
          return setTimeout(_send, 100);
        }
        return res.status(500).end('Internal error. (code = -1)');    
      }     
      res.sendFile(fileName, { root: folderPath }, (err) => {
        if (err) {
          console.error(err.message);
          return res.status(500).end('Internal error. (code = -2)');           
        }         
        // Send file success, remove folder.
        rimraf(folderPath, (err) => {
          if (err) {
            console.error(`Delte ${folderPath} FAILED!!`);
          }
        });        
      });             
    });    
  }


  if ( result === RESULT.OK ) {
    _send();
  }
  else {
    res.status(404).end('Files not found.');
  }
}

function processNormalResponse(res, replyData) {
  res.write(replyData.result);
  res.end();  
}

function onUpload(req, res) {
  const type = req.headers['content-type'] || '';
  const isFormData = 0 === type.indexOf('multipart/form-data');
  if( !isFormData ) {
    return res.status(400).end();
  }
  //start upload files  
  const SUB_FOLDER_NAME = String( genUUID() );
  const NEW_FOLDER_PATH = path.resolve(UPLOAD_FOLDER_PATH, SUB_FOLDER_NAME); 
  const _makeFailedResponse = (msg) => {
    res.status(204).end(msg);
  };

  fs.mkdir(NEW_FOLDER_PATH, err => {
    if (err) {
      console.error(err.message);
      return _makeFailedResponse(err.message);
    }
    _startUpload();
  });

  function _startUpload() {
    const form = new formidable.IncomingForm();  
    form.uploadDir = NEW_FOLDER_PATH;
    form.keepExtensions = true;
    const file_path_list = [];
    let renameComplete = false;
    form.on('file', function(field, file) {
      //rename the incoming file to the file's name      
      if( file.name ) {        
        const newFilePath = path.resolve(NEW_FOLDER_PATH, file.name);        
        // fs.rename(file.path, newFilePath);        
        file_path_list.push({
          oriPath: file.path,
          newPath: newFilePath
        });
      }        
      else {        
        fs.unlink(file.path, (err) => {
          if (err) {
            console.error(`Delte empty file ${file.path} FAILED!!`);
          }
          else {
            console.log(`Delte empty file ${file.path} success!`);
          }           
        });       
      }
    });
    form.parse(req, function(err, fields, files){  
    });

    form.on('end', function() {
      console.log('Uplaod Complete!');
      console.log(file_path_list);
      //console.log(files);
      const totalFilesNum = file_path_list.length;
      let count = 0;
      if (totalFilesNum !== 0) {
        file_path_list.forEach(({oriPath, newPath}) => {
          fs.rename(oriPath, newPath, (err) => {
            if (err) {
              console.error('\nRename failed ????????\n');
            }
            count++;
            if (count === totalFilesNum) {
              res.json({
                code     : 0,
                msg      : 'Upload success!',
                subFolder: SUB_FOLDER_NAME
              });
            }
          });
        });
      }
      else{
        _makeFailedResponse('Empty files');
      }      
    });

    form.on('progress', function(bytesRecv, bytesExpect){
      var percent = Math.floor(bytesRecv/bytesExpect*100);
      // console.log(percent);
    });  
  }
}

function onWebsocketClose() {
  console.log('[wss]: connection close!');
  // clear all cached response
  for (let uuid in resStore) {
    const res = resStore[uuid];
    res.status(500).end('WebSocket Close.');
    delete resStore[uuid];
  }
  // clear cached webscoket
  globalWs = null;
}

function onWebSocketOpen() {
  console.log('[wss]: connection created!')
}

function genUUID() {
  // time based uuid
  return uuid.v1();    
}