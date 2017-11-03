const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const uaParser = require('ua-parser-js');
const app = express();
const http = require('http');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const formidable = require('formidable');
const UPLOAD_FOLDER_PATH = path.resolve(__dirname, "upload");
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, "public");
if (!fs.existsSync(UPLOAD_FOLDER_PATH)){
  fs.mkdirSync(UPLOAD_FOLDER_PATH);
}

// default options
app.use(cookieParser() );
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static( PUBLIC_FOLDER_PATH )); 

app.post('/upload', upload);
app.use( onRequestNotFound );

const server = http.createServer(app);
server.listen(8080, (err) => {
	if (err) {
		console.error(err.message);
	}
	console.log(`Listening on ${ server.address().port }`);
});


function upload(req, res) {	
  //check type is correct  
  const type = req.headers['content-type'] || '';
  const isFormData = 0 === type.indexOf('multipart/form-data');
  if( !isFormData ) {
    return res.status(400).end();
  }
  //start upload files  
  const form = new formidable.IncomingForm();
  // form.uploadDir =  UPLOAD_FOLDER_PATH;
  const newFolder = path.resolve(UPLOAD_FOLDER_PATH, String( Date.now() ) ); 
  fs.mkdirSync(newFolder);
  form.uploadDir = newFolder;
  form.keepExtensions = true;
  const file_path_list = [];
  form.on('file', function(field, file) {
      //rename the incoming file to the file's name      
      console.log('FILE!');
      if( file.name ) {
      	// const newFilePath = path.resolve(UPLOAD_FOLDER_PATH, file.name);
        const newFilePath = path.resolve(newFolder, file.name);
        console.log(file.path);
        fs.rename(file.path, newFilePath);        
        file_path_list.push(newFilePath);
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
    console.log('PARSE!');
    console.log(file_path_list);
    //console.log(files);
    if(file_path_list.length != 0){
    	res.json({
    		code: 0,
    		msg: 'Upload success!'
    	});
    }
    else{
      res.status(204).end();
    }  
    setTimeout(()=>{
      rimraf(newFolder, (err) => {
          if (err) {
            console.error(`Delte folder FAILED!!`);
          }
          else {
            console.log(`Delte folder success!`);
          }           
      });        
    }, 2000);
  });
  form.on('progress', function(bytesRecv, bytesExpect){
    var percent = Math.floor(bytesRecv/bytesExpect*100);
    // console.log(percent);
  });	
  form.on('end', function() {
    console.log('END');
  });  
}

function onRequestNotFound (req, res) {
  res.status(404).send("404 files not found");
}