const request = require('request');
const path    = require('path');
const fs      = require('fs');
const LOCAL_FOLDER_PATH = path.resolve(__dirname, "local");
const filepath_1 = path.resolve(LOCAL_FOLDER_PATH, "one-piece.jpg");
const filepath_2 = path.resolve(LOCAL_FOLDER_PATH, "test.jpg");


const req = request.post('http://localhost:8080/upload', function (err, resp, body) {
  if (err) {
    console.log('Error!');
  } else {
    console.log('URL: ' + body);
  }
});
const form = req.form();
form.append('file_1', fs.createReadStream( filepath_1 ));
form.append('file_2', fs.createReadStream( filepath_2 ));