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
const { CMD, CMD_TYPE, RESULT } = require('./constants.js');
const resStore = {};
let globalWs = null;  // Assume only one relayClient !!!!!!

const UPLOAD_FOLDER_NAME = "cloud_upload";
const UPLOAD_FOLDER_PATH = path.resolve(__dirname, UPLOAD_FOLDER_NAME);
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
  app.get('/relay/download/:mainFolder/:subFolder/:fileName', onRelayDowload);
  // app.get('/relay/download/:filePath', onRelayDowload);
  app.post('/relay/upload', onRelayUpload);
  app.post('/web/upload', onWebUpload); // Assume upload files from NVR
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


//=========================== BEGIN CGI FUNCTIONS ===========================//
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

function onRelayUpload(req, res) {
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
    const fileList = [];
    form.on('file', function(field, file) {
      //rename the incoming file to the file's name      
      if( file.name ) {        
        const newFilePath = path.resolve(NEW_FOLDER_PATH, file.name);        
        // fs.rename(file.path, newFilePath);        
        fileList.push({
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
    form.parse(req, function(err, fields, files) {  
    });    
    form.on('end', function() {
      console.log('Uplaod Complete!');
      console.log(fileList);
      //console.log(files);
      const totalFilesNum = fileList.length;
      let count = 0;
      if (totalFilesNum !== 0) {
        fileList.forEach(({oriPath, newPath}) => {
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
  }
}

function onRelayDowload(req, res) {
  console.log('\n===============onRelayDowload:');
  // console.log(`req.params.filePath = ${req.params.filePath}`);  
  const {mainFolder, subFolder, fileName} = req.params;
  const fileAbsPath = path.resolve(__dirname, mainFolder, subFolder, fileName);
  console.log(fileAbsPath);
  fs.access(fileAbsPath, (err) => {    
    if (err) {
      console.log('a:' + err.message);
      return res.status(404).end('Files not found!');
    }     
    res.sendFile(fileAbsPath, (err) => {
      if (err) {
        console.log('b:' + err.message);
        return res.status(500).end('Send file error!');
      }         
      console.log(`download ${fileAbsPath} done.`);                    
    });             
  });  
}

function onWebUpload(req, res) {
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
    const fileList = [];
    form.on('file', function(field, file) {
      //rename the incoming file to the file's name      
      if( file.name ) {        
        const newFilePath = path.resolve(NEW_FOLDER_PATH, file.name);        
        // fs.rename(file.path, newFilePath);        
        fileList.push({
          oriPath : file.path,
          newPath : newFilePath,
          fileName: file.name
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
    form.parse(req, function(err, fields, files) {});    
    form.on('end', function() {
      console.log('Uplaod Complete!');
      console.log(fileList);
      //console.log(files);
      const totalFilesNum = fileList.length;
      let count = 0;
      if (totalFilesNum !== 0) {
        fileList.forEach(({oriPath, newPath}) => {
          fs.rename(oriPath, newPath, (err) => {
            if (err) {
              console.error('\nRename failed ????????\n');
            }
            count++;
            if (count === totalFilesNum) {
              askRelayClientToBypassUploadFile(
                res, 
                SUB_FOLDER_NAME, 
                fileList.map(f => f.fileName)
              );
            }
          });
        });
      }
      else{
        _makeFailedResponse('Empty files');
      }      
    });    
  }
}
//=========================== END CGI FUNCTIONS ===========================//

//=========================== BEGIN WEBSOCKET EVENTS ==============================//
function onWebSocketMessage( data ) {
  // data = JSON.parse(data);
  // console.log('[wss]: received: %s', data.result);
  const replyData = JSON.parse(data);

  // console.log('\n=== received');
  // console.log(replyData);

  const {uuid, cmd, cmdType} = replyData;
  const res = resStore[uuid];
  if (res === undefined) {
    //return console.error('\nError: Cached response disapper!!, data = %s\n', data);
    return console.error('\nError: Cached response disapper!!');
  }
  if (cmd === CMD.FILE_REQUEST) {
    switch (cmdType) {
      case CMD_TYPE.FILE_DOWNLOAD:
        processFileDownloadResponse(res, replyData);
      break;
      case CMD_TYPE.FILE_UPLOAD:
        processFileUploadResponse(res, replyData);
      break;
      default:
        throw new Error('undefined cmdType = ' + cmdType);
    }
  }
  else {
    processNormalResponse(res, replyData);
  }
  delete resStore[replyData.uuid];
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
//=========================== END WEBSOCKET EVENTS ==============================//

//=========================== BEGIN PRIVATE FUNCTIONS ===============================//
function genDataToWs(req) {
  const fileName = path.basename(req.path);
  const isFile = (fileName.indexOf('.') !== -1);     
  const method = req.method;

  if (isFile && method === 'GET') {  // Consider GET file first. !!!!!!
    return {
      cmd     : CMD.FILE_REQUEST,
      cmdType : CMD_TYPE.FILE_DOWNLOAD,
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

function processNormalResponse(res, replyData) {
  res.write(replyData.body);
  res.end();  
}

function processFileDownloadResponse(res, replyData) {
  const { result, subFolder, fileName } = replyData;
  const folderPath = path.resolve(UPLOAD_FOLDER_PATH, String(subFolder) );

  if ( result === RESULT.OK ) {
    const filePath = path.resolve(folderPath, fileName);
    fs.access(filePath, (err) => {    
      if (err) {        
        console.error(err.message);
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
  else {
    res.status(404).end('Files not found.');
  }
}

function processFileUploadResponse(res, replyData) {
  res.status(replyData.statusCode).write(replyData.body);
  res.end();    

  // if (replyData.statusCode === 200) {
    const {subFolder} = replyData;
    const folderPath = path.resolve(UPLOAD_FOLDER_PATH, subFolder);
    rimraf(folderPath, (err) => {
      if (err) {
        console.error(`Delte ${folderPath} FAILED!!`);
      }
    });   
  // }
}

function askRelayClientToBypassUploadFile(res, subFolder, fileNameList) {

  if (globalWs && globalWs.readyState == 1) {
    const uuid = genUUID();  
    const data = {
      cmd         : CMD.FILE_REQUEST,
      cmdType     : CMD_TYPE.FILE_UPLOAD,      
      mainFolder  : UPLOAD_FOLDER_NAME, // Watch Out! Is "_NAME", not "_FOLDER"
      subFolder   : subFolder,    
      fileNameList: fileNameList      
    };
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

function genUUID() {
  // time based uuid
  return uuid.v1();    
}
//=========================== END PRIVATE FUNCTIONS ===============================//
