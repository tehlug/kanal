var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('data.sqlite');

var members = 'CREATE TABLE members ( id INTEGER PRIMARY KEY AUTOINCREMENT, msisdn VARCHAR(255) UNIQUE, name VARCHAR(255), email VARCHAR(255) )';
var presence = 'CREATE TABLE presence ( id INT(11), user_id INT(11), date DATETIME, session INT(3), UNIQUE(user_id, session) )';

db.run(members, createResponse);
db.run(presence, createResponse);


function createResponse(err, result) {
  console.log(err, result);
}