const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const uaParser = require('ua-parser-js');
const app = express();
const http = require('http');
const path = require('path');
const fs = require('fs');

const PUBLIC_FOLDER_PATH = path.resolve(__dirname, "public");
const LOCAL_FOLDER_PATH = path.resolve(__dirname, "local");

app.use(cookieParser() );
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static( PUBLIC_FOLDER_PATH )); 

app.use((req, res, next) => {
	// console.log(req.path);
	console.log('');
	console.log('originalUrl: ' + req.originalUrl);
	console.log('url: ' + req.url);

	const fileName = path.basename(req.path);
	const isFile = (fileName.indexOf('.') !== -1);
	// console.log( fileName );
	console.log(`is file? ${ isFile }`);
		if ( isFile ) {
		const filePath = path.resolve(LOCAL_FOLDER_PATH, fileName);
		fs.access(filePath, (err) => {    
			if (err) {
				console.log('a:' + err.message);
				return next();
			}			
		  res.sendFile(fileName, { root: LOCAL_FOLDER_PATH }, (err) => {
		    if (err) {
		      console.log('b:' + err.message);
		      return next();
		    } 		    
				console.log(`download ${fileName} done.`);		       			    
		  }); 						
		});
	}
	else {
		next();
	}	
});

app.use( onRequestNotFound );

const server = http.createServer(app);
server.listen(8080, (err) => {
	if (err) {
		console.error(err.message);
	}
	console.log(`Listening on ${ server.address().port }`);
});

function onRequestNotFound (req, res) {
  res.status(404).send("404 files not found");
}