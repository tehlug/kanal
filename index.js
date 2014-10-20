var Modem = require('modem').Modem;
var util = require('util');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('data.sqlite');
var fs = require('fs');
var express = require('express');
var app = express();

app.use(express.static(__dirname + '/public'));

var http = require('http').Server(app);
var io = require('socket.io')(http);

SESSION_ID = parseInt(fs.readFileSync('tehlug/scripts/next_session.id'))-1;

io.on('connection', function(sock) {
  sock.on('get present members', function(cb) {
    var q = 'SELECT * FROM presence JOIN members ON presence.user_id = members.id WHERE session = ?';
    db.all(q, SESSION_ID, cb);
  });

  sock.on('get session number', function(cb) {
    cb(SESSION_ID);
  });
});

http.listen(8080);

var modem = new Modem();

var DEVICE = '/dev/ttyUSB2';
modem.open(DEVICE, function() {
  modem.on('sms received', smsReceived);

  modem.on('memory full', function(memory) {
    modem.execute('AT+CPMS="'+memory+'"', function(usage) {
      modem.getMessages(function(messages) {
        for(var i in messages) {
          var message = messages[i];

          for(var j in message.indexes) {
            modem.deleteMessage(message.indexes[j]);
          }
        }
      });
    });
  });

  var sms = {
    text:'say\nfuck you',
    sender:'989124834198'
  }

  setTimeout(function() {
//     smsReceived(sms);
  }, 4000);
});

commands = {};
commands.email = function(lines, user) {
  var email = lines[0];
  var q = 'UPDATE members SET email = ? WHERE id = ?';
  db.run(q, email, user.id, function() {

    var t = '%s عزیز، آدرس پست الکترونیک شما ثبت شد';

    modem.sms({
      text:util.format(t, user.name),
      receiver:user.msisdn,
      encoding:'16bit'
    });
  });
}

commands.name = function(lines, user) {
  var name = lines[0];
  var q = 'UPDATE members SET name = ? WHERE id = ?';
  db.run(q, name, user.id, function() {

    var t = 'نام شما در سیستم به %s تغییر کرد.';

    modem.sms({
      text:util.format(t, name),
      receiver:user.msisdn,
      encoding:'16bit'
    });
  });
}

commands.say = function(msg, user) {
  io.sockets.emit('say', user, msg);
}

commands.whisper = function(msg, user) {
  io.sockets.emit('whisper', msg);
}

function smsReceived(sms) {
  sms.text = sms.text.replace(/\u0000/g, '');

  findUser(sms.sender, function(err, user) {
    if(err)
      return ;

    if(!user)
      return newUser(sms);

    if(sms.text.trim() === '')
      return savePresence(user, sms);

    var parts = sms.text.split('\n');
    var command = parts.shift().toLowerCase();

    if(!commands[command]) {
      modem.sms({
        receiver:sms.sender,
        text:'دستور مورد نظر یافت نشد',
        encoding:'16bit'
      });
      return ;
    }

    commands[command](parts,user);
  });

  deleteSms(sms);
}

function deleteSms(sms) {
  for(var i in sms.indexes)
    modem.deleteMessage(sms.indexes[i]);
}

function newUser(sms) {
  if(sms.text.trim() == '')
    return registrationHelp(sms);

  var parts = sms.text.split('\n');
  if(parts.length !== 2)
    return registrationHelp(sms);

  register(sms);
}

function registrationHelp(sms) {
  var t = 'برای ثبت نام، در خط اول نام و در خط دوم ایمیل خود را وارد کنید.';

  modem.sms({
    receiver:sms.sender,
    text:t,
    encoding:'16bit'
  });
}

function findUser(msisdn, cb) {
  var q = 'SELECT * FROM members WHERE msisdn = ?';
  db.get(q, msisdn, cb);
}

function register(sms) {
  var parts = sms.text.split('\n');
  var name = parts[0];
  var email = parts[1];
  var msisdn = sms.sender;

  var t = '%s عزیز، به تهران‌لاگ خوش آمدید!';

  modem.sms({
    receiver:sms.sender,
    text:util.format(t, name),
    encoding:'16bit'
  });

  var q = 'INSERT INTO members (msisdn, name, email) VALUES (?,?,?)';

  db.run(q, msisdn, name, email, function(err, result) {
    findUser(msisdn, function(err, user) {
      if(err)
        return ;
      savePresence(user, sms);
    });
  });
}

function savePresence(user, sms) {
  var q = 'INSERT INTO presence (user_id, session) VALUES (?,?)';
  db.run(q, user.id, SESSION_ID, function(err) {
    if(err && err.errno === 19) {
      var t = 'حضور شما در جلسه %s قبلا ثبت شده است';

      modem.sms({
        receiver:user.msisdn,
        text:util.format(t, SESSION_ID),
        encoding:'16bit'
      });
      return ;
    }

    var t = '%s عزیز، حضور شما در جلسه %s ثبت شد';

    modem.sms({
      receiver:user.msisdn,
      text:util.format(t, user.name, SESSION_ID),
      encoding:'16bit'
    });

    io.sockets.emit('presence', user);
  });
}