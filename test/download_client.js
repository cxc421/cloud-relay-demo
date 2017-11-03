const request = require('request');
const fs = require('fs');
const path = require('path');

const DOWNLOAD_FOLDER_PATH = path.resolve(__dirname, "download");
if (!fs.existsSync(DOWNLOAD_FOLDER_PATH)){
  fs.mkdirSync(DOWNLOAD_FOLDER_PATH);
}
const fileName = 'record.png';

var r = request
  .get('http://localhost:8080/' + fileName)
  .on('error', function(err) {
    console.log(err)
  })    
  .on('response', function(response) {
    console.log(response.statusCode) // 200
    console.log(response.headers['content-type']) // 'image/png'
    if (response.statusCode === 200) {
			r.pipe(fs.createWriteStream( path.resolve(DOWNLOAD_FOLDER_PATH, fileName) ));
    }
  });			  
			  