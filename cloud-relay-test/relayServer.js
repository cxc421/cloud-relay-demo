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
const { CMD, CMD_TYPE, RESULT, WS_PROTOCOL } = require('./constants.js');


const resStore = {};
const wsStore = {};
let globalWs = null;  // Assume only one relayClient !!!!!!
const wsCounter = {
  p2p : 0,
  http: 0,
  web : 0,
  add: function (type) {
    if (this[type] !== undefined) {
      this[type]++;
      console.log(`\nWebSocket Connect! type = ${type}`);
      this.show();
    }
    else {
      console.log(`\nwsCounter error!. type = ${type}`);
    }
  },
  delete: function (type) {
    if (this[type] !== undefined) {
      this[type]--;
      console.log(`\nWebSocket Close! type = ${type}`);
      this.show();      
    }
    else {
      console.log(`\nwsCounter error!. type = ${type}`);
    }
  },
  show: function() {
    console.log(`p2p: ${this.p2p}, http: ${this.http}, web:${this.web}\n`);
  }
};


// const UPLOAD_FOLDER_NAME = "cloud_upload";
// const UPLOAD_FOLDER_PATH = path.resolve(__dirname, UPLOAD_FOLDER_NAME);
// if (!fs.existsSync(UPLOAD_FOLDER_PATH)){
//   fs.mkdirSync(UPLOAD_FOLDER_PATH);
// }

(function() {
  // middleware
  app.use(cookieParser() );
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  // app.use(express.static( PUBLIC_FOLDER_PATH ));   

  // router
  // app.get('/relay/download/:mainFolder/:subFolder/:fileName', onRelayDowload);  
  // app.post('/relay/upload', onRelayUpload);
  // app.post('/web/upload', onWebUpload); 
  app.get('/favicon.ico', (req, res) => res.status(404).end('Files not found.'));
  app.get('/test.html', onGetTestPage);
  app.use('/', onGetDefaultRequest);
  // app.use('/', makeNormalRequest);

  const server = http.createServer(app);
  const handleProtocols = (protocols, req) => {
    if (protocols[0] === WS_PROTOCOL.P2P) {
      try {
        const __nextWs = wsStore[ protocols[1] ];
        req['__nextWs'] = __nextWs;
      } 
      catch(e) {
        console.error('\n handleProtocols error:');
        console.error(`protocols[1] = ${protocols[1]}`);
        if (protocols[1]) {
          console.error(`Can't find wsStore with this uuid!`);
        }
        return false;
      }
    }
    return protocols[0];
  };
  const wss = new WebSocket.Server({ server, handleProtocols });
  wss.on('connection', function connection(ws, req) {
    switch (ws.protocol) {
      case WS_PROTOCOL.HTTP: {
        // count        
        wsCounter.add('http');
        globalWs = ws;
        ws.on('message', onWebSocketMessage); 
        // ws.on('close', onWebsocketClose);     
        ws.on('close', () => {
          // count        
          wsCounter.delete('http');
          
          // clear all cached response
          for (let uuid in resStore) {
            const res = resStore[uuid];
            res.status(500).end('WebSocket Close.');
            delete resStore[uuid];
          }
          // clear cached webscoket
          globalWs = null;
        });         
        break;
      }      
      case WS_PROTOCOL.P2P: {
        // count        
        wsCounter.add('p2p');

        // save 
        const __nextWs = req.__nextWs;
        delete req.__nextWs;
        // bind to each
        ws['__nextWs'] = __nextWs;
        __nextWs['__nextWs'] = ws;
        // init cached
        ws['__cachedMsgList'] = [];
        // bind events;
        ws.on('message', onWebSocketMessage_WEB_P2P);         
        ws.on('close', () => {
          // count        
          wsCounter.delete('p2p');
          
          if (ws.__nextWs && ws.__nextWs.readyState === WebSocket.OPEN) {
            ws.__nextWs.terminate();
          }
          ws['__nextWs'] = null;
          ws['__cachedMsgList'] = null;                              
        });
        break;      
      }  
      default: {
        // count        
        wsCounter.add('web');

        const uuid = genUUID();
        ws['__nextWs'] = null;
        ws['__cachedMsgList'] = [];
        wsStore[uuid] = ws;

        ws.on('message', onWebSocketMessage_WEB_P2P);         
        ws.on('close', () => {
          // count        
          wsCounter.delete('web');
          
          if (ws.__nextWs && ws.__nextWs.readyState === WebSocket.OPEN) {
            ws.__nextWs.terminate();
          }          
          ws['__nextWs'] = null;
          ws['__cachedMsgList'] = null;                    
          delete wsStore[uuid];
        });                    
        askRelayClientMakeNewSocket(ws.protocol, uuid);
        break;
      }    
    }
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
  console.log('\n----------------On Request---------------------:');
  console.log( req.method + ': ' + req.originalUrl);
  if (globalWs && globalWs.readyState == WebSocket.OPEN) {
    const uuid = genUUID();  
    const data = genDataToWs(req);
    resStore[uuid] = res;
    data['uuid'] = uuid;
    data['cookie'] = req.headers.cookie;
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
          newPath: newFilePath.split('?')[0]
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
      // console.log('Uplaod Complete!');
      // console.log(fileList);
      //console.log(files);
      const totalFilesNum = fileList.length;
      let count = 0;
      if (totalFilesNum !== 0) {
        ensureAllFileReady(fileList.map(f => f.oriPath), () => {
          fileList.forEach(({oriPath, newPath}) => {
            fs.rename(oriPath, newPath, (err) => {
              if (err) {
                console.error('\nRename failed ????????\n');
                console.error(err.message);
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
        });        
      }
      else{
        _makeFailedResponse('Empty files');
      }      
    });    
  }
}

function ensureAllFileReady(fileList, cb) {
  let curIndex = 0;
  const check = () => {
    fs.access( fileList[curIndex] , (err) => {
      if (err) {
        setTimeout( check, 10 );
        return false;
      }
      // console.log('EXIST: ' + fileList[curIndex]);
      curIndex++;
      if (curIndex < fileList.length) {        
        check();
      }
      else {
        cb();
      }
    });    
  };
  check();
}

function onRelayDowload(req, res) {
  // console.log('\n===============onRelayDowload:');
  // console.log(`req.params.filePath = ${req.params.filePath}`);  
  const {mainFolder, subFolder, fileName} = req.params;
  const fileAbsPath = path.resolve(__dirname, mainFolder, subFolder, fileName);
  console.log(fileAbsPath);
  fs.access(fileAbsPath, (err) => {    
    if (err) {
      // console.log('a:' + err.message);
      return res.status(404).end('Files not found!');
    }     
    res.sendFile(fileAbsPath, (err) => {
      if (err) {
        // console.log('b:' + err.message);
        return res.status(500).end('Send file error!');
      }         
      // console.log(`download ${fileAbsPath} done.`);                    
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
      // console.log('Uplaod Complete!');
      // console.log(fileList);
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

function onGetTestPage(req, res) {
  var fileName = "test.html",
      options  = {
        root: './'
      };  
  res.sendFile(fileName, options, function (err) {
    if (err) {
      console.log(err);
      res.status(500).end();
    }
  });     
}
//=========================== END CGI FUNCTIONS ===========================//

//=========================== BEGIN WEBSOCKET EVENTS ==============================//
function onWebSocketMessage( data ) {
  // data = JSON.parse(data);
  // console.log('[wss]: received: %s', data.result);
  const replyData = JSON.parse(data);
  console.log('\n===================On Message====================:');
  console.log(replyData);
  console.log('');
  // console.log(`url=${replyData.url}, cmd=${replyData.cmd}, uuid=${replyData.uuid}`);
  // console.log( replyData );
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

function onWebSocketMessage_WEB_P2P( newMsg ) {
  if (this.__nextWs !== null && this.__nextWs.readyState === WebSocket.OPEN) {
    // Ensure pre cahedMsg All send
    while( this.__cachedMsgList.length > 0 ) {
      const cachedMsg = this.__cachedMsgList.shift();
      this.__nextWs.send( cachedMsg );
    }
    // Send new msg
    this.__nextWs.send( newMsg );
  }
  else {
    // Cached msg
    this.__cachedMsgList.push( newMsg );
  }
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
      cmd        : CMD.HTTP_REQUEST,
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
  var headerObj = {};
  // console.log('************************');
  // console.log(replyData);
  if (replyData.setCookie) {
    headerObj['Set-Cookie'] = replyData.setCookie;
  }
  if (replyData.location) {
    headerObj['Location'] = replyData.location; 
    // console.log('SET Location!');
  }
  res.writeHead(replyData.statusCode, headerObj);      
  if (typeof replyData.body !== 'string') {
    try {
      res.write( JSON.stringify(replyData.body) );
    }
    catch(e) {
      res.write( (replyData.body).toString() );
    }
  }
  else {
    res.write(replyData.body);
  }  
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

  if (globalWs && globalWs.readyState == WebSocket.OPEN) {
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

function askRelayClientMakeNewSocket(wsProtocol, uuid) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify({
      wsProtocol: wsProtocol,
      uuid      : uuid,
      cmd       : CMD.WEBSOCKET_REQUEST
    }));
  }
}

function genUUID() {
  // time based uuid
  return uuid.v1();    
}
//=========================== END PRIVATE FUNCTIONS ===============================//
