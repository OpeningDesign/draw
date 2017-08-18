/**
 * Module dependencies.
 */

var settings = require('./src/util/Settings.js'),
    tests = require('./src/util/tests.js'),
    draw = require('./src/util/draw.js'),
    projects = require('./src/util/projects.js'),
    db = require('./src/util/db.js'),
    express = require("express"),
    paper = require('paper'),
    socket = require('socket.io'),
    async = require('async'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    argv,
    removeTimeouts = {},
    tokens = {};

/** 
 * SSL Logic and Server bindings
 */ 
if(settings.ssl){
  console.log("SSL Enabled");
  console.log("SSL Key File" + settings.ssl.key);
  console.log("SSL Cert Auth File" + settings.ssl.cert);

  var options = {
    key: fs.readFileSync(settings.ssl.key),
    cert: fs.readFileSync(settings.ssl.cert)
  };
  var app = express(options);
  var server = https.createServer(options, app).listen(settings.ip, settings.port);
}else{
  var app = express();
  var server = app.listen(settings.port, settings.ip);
}

/** 
 * Build Client Settings that we will send to the client
 */
var clientSettings = {
  "tool": settings.tool
}

if (typeof settings.editPassword === 'string') {
  clientSettings.protectedEdit = true;
}

// Config Express to server static files from /
app.configure(function(){
  app.use(express.static(__dirname + '/'));
});

// Sessions
app.use(express.cookieParser());
app.use(express.session({secret: 'secret', key: 'express.sid'}));

// Development mode setting
app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  argv = require('minimist')(process.argv.slice(2));

  settings.removeUnused = (argv.removeUnused ? argv.removeUnused
    : (settings.removeUnused ? settings.removeUnused : undefined));
  
  if (settings.removeUnused) {
    // Parse value
    var parse;
    try {
      settings.removeUnused = parseTimeSetting(settings.removeUnused);
      console.log('get value', settings.removeUnused);
    } catch(error) {
      throw new Error('Invalid value for --removeUnused: '
          + settings.removeUnused);
    }
    console.log('Unused rooms will be deleted after %s seconds', settings.removeUnused);
  }

  if (settings.authenticationTimeout) {
    try {
      settings.authenticationTimeout = parseTimeSetting(settings.authenticationTimeout);
    } catch(error) {
      throw new Error('Invalid value authenticationTimeout: '
          + settings.authenticationTimeout);
    }

    console.log('Users will be logged out after %s seconds', settings.removeUnused);
    // Check for an remove old tokens every minute
    setInterval(removeOldTokens, 30000);
  }
});

function parseTimeSetting(value) {
  console.log('parseTimeSetting', value);
  if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    var number = Number(value);

    if (!isNaN(number)) {
      return number;
    }

    if ((parse 
        = value.match(/^([0-9]+(\.[0-9]+)?)(mins?|h(ou)?rs?|days?)?$/)) !== null) {
      number = Number(parse[1]);
      if (!isNaN(number)) {
        if (parse[3]) {
          var mul = 60;

          switch (parse[3]) {
            case 'days':
            case 'day':
              mul *= 24;
            case 'hours':
            case 'hour':
            case 'hrs':
            case 'hr':
              mul *= 60;
            case 'mins':
            case 'min':
          }
          number *= mul;
        }
         return number;
      }
    }
  }

  throw new Error('Invalid value given: ' + value);
}

// Production mode setting
app.configure('production', function(){
  app.use(express.errorHandler());
});




// ROUTES
// Index page
app.get('/', function(req, res){
  res.sendfile(__dirname + '/src/static/html/index.html');
});

// Drawings
app.get('/d/*', function(req, res){
  res.sendfile(__dirname + '/src/static/html/draw.html');
});

// Front-end tests
app.get('/tests/frontend/specs_list.js', function(req, res){
  tests.specsList(function(tests){
    res.send("var specs_list = " + JSON.stringify(tests) + ";\n");
  });
});

// Used for front-end tests
app.get('/tests/frontend', function (req, res) {
  res.redirect('/tests/frontend/');
});

// Static files IE Javascript and CSS
app.use("/static", express.static(__dirname + '/src/static'));

var io;

// Initialise the database, then start the server
db.init(function(err) {
  if(err) {
    throw err;
  }

  // LISTEN FOR REQUESTS
  io = socket.listen(server);
  io.sockets.setMaxListeners(0);

  console.log("Access Etherdraw at http://"+settings.ip+":"+settings.port);

  // Create remove timeouts for existing rooms if removeUnused is set
  if (settings.removeUnused) {
    // Get current rooms
    db.rooms(function(err, keys) {
      var k;
      for (k in keys) {
        console.log('Removing room %s in %d seconds', keys[k],
            settings.removeUnused);
        if (removeTimeouts[keys[k]] === undefined) {
          removeTimeouts = setTimeout(removeRoom.bind(this, 
              io.sockets, keys[k]), settings.removeUnused * 1000);
        }
      }
    });
  }

  // SOCKET IO
  io.sockets.on('connection', function (socket) {
    var room, token;

    socket.on('disconnect', function () {
      console.log("Socket disconnected");
      /* Start a timeout to delete the room if it remains unused for the given
       * time
       */
      if (argv && settings.removeUnused) {
        var rooms;
        if (rooms = socket.adapter.rooms[room]) {
          // Check if were the last one connected to the room
          if (Object.keys(rooms).length === 0) {
            // Create the timeout to remove the room
            if (removeTimeouts[room]) {
              clearTimeout(removeTimeouts[room]);
            }
             console.log('Removing room %s in %d seconds', room,
                settings.removeUnused);
            removeTimeouts[room] = setTimeout(removeRoom.bind(this, 
                socket, room), settings.removeUnused * 1000);
          }
        }
      }
    });

    // EVENT: User stops drawing something
    // Having room as a parameter is not good for secure rooms
    socket.on('draw:progress', function (room, uid, co_ordinates) {
      if (!projects.projects[room] || !projects.projects[room].project) {
        loadError(socket);
        return;
      }
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      io.in(room).emit('draw:progress', uid, co_ordinates);
      draw.progressExternalPath(room, JSON.parse(co_ordinates), uid);
    });

    // EVENT: User stops drawing something
    // Having room as a parameter is not good for secure rooms
    socket.on('draw:end', function (room, uid, co_ordinates) {
      if (!projects.projects[room] || !projects.projects[room].project) {
        loadError(socket);
        return;
      }
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      io.in(room).emit('draw:end', uid, co_ordinates);
      draw.endExternalPath(room, JSON.parse(co_ordinates), uid);
    });

    // EVENT: User draws a textbox
    socket.on('draw:textbox', function (room, uid, textbox) {
      if (!projects.projects[room] || !projects.projects[room].project) {
        loadError(socket);
        return;
      }
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      io.in(room).emit('draw:textbox', uid, textbox);
      draw.addTextbox(room, JSON.parse(textbox));
    });

    // User joins a room
    socket.on('subscribe', function(data) {
      room = data.room;

      // Subscribe the client to the room
      socket.join(room);

      // If there is a remove timeout activate, remove it
      if (removeTimeouts[room]) {
        clearTimeout(removeTimeouts[room]);
        delete removeTimeouts[room];
      }

      var roomSettings = Object.assign({}, clientSettings);

      if (typeof settings.editPassword === 'object') {
        roomSettings.protectedEdit = (typeof settings.editPassword[room] !== 'undefined');
      }

      // Check authentication token
      if (data.token && tokens[data.token]) {
        token = data.token;
        roomSettings.token = true;
        if (typeof settings.editPassword !== 'object'
          || tokens[data.token].rooms.indexOf(room) !== -1) {
          roomSettings.authenticated = true;
        }
      }
      socket.emit('settings', roomSettings);

      // Create Paperjs instance for this room if it doesn't exist
      var project = projects.projects[room];
      if (!project) {
        console.log('Made room %s', room);
        projects.projects[room] = {};
        // Use the view from the default project. This project is the default
        // one created when paper is instantiated. Nothing is ever written to
        // this project as each room has its own project. We share the View
        // object but that just helps it "draw" stuff to the invisible server
        // canvas.
        projects.projects[room].project = new paper.Project();
        projects.projects[room].external_paths = {};
        db.load(room, socket);
      } else { // Project exists in memory, no need to load from database
        loadFromMemory(room, socket);
      }

      // Broadcast to room the new user count -- currently broken
      var rooms = socket.adapter.rooms[room]; 
      var roomUserCount = Object.keys(rooms).length;
      io.to(room).emit('user:connect', roomUserCount);
    });

    // User tries to authenticate
    socket.on('user:authenticate:edit', function(room, uid, authentication) {
      if (settings.editPassword) {
        var roomPassword;
        if (typeof settings.editPassword === 'string') {
          roomPassword = settings.editPassword;
        } else if (typeof settings.editPassword === 'object') {
          roomPassword = settings.editPassword[room];
        }

        if (roomPassword) {
          if (authentication.password) {
            if (roomPassword !== authentication.password) {
              socket.emit('user:authenticate:edit', 'Incorrect password.',
                (authentication.token && typeof tokens[authentication.token] !== 'undefined'));
              return;
            } else {
              if (authentication.token && tokens[authentication.token]) {
                token = authentication.token;
                if (tokens[token].rooms.indexOf(room) === -1) {
                  tokens[token].rooms.push(room);
                }
              } else {
                token = createToken(room);
              }
              socket.emit('user:authenticate:edit', null, token);
              return;
            }
          } else if (authentication.token) {
            if (checkToken(authentication.token, room)) {
              token = authentication.token;
              socket.emit('user:authenticate:edit', null, token);
            } else {
              socket.emit('user:authenticate:edit', true, true);
            }
            return;
          }

          socket.emit('user:authenticate:edit', null);
        }
      }

      socket.emit('user:authenticate:edit', null);
    });

    // User clears canvas
    socket.on('canvas:clear', function(room) {
      if (!projects.projects[room] || !projects.projects[room].project) {
        loadError(socket);
        return;
      }
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      draw.clearCanvas(room);
      io.in(room).emit('canvas:clear');
    });

    // User removes an item
    socket.on('item:remove', function(room, uid, itemName) {
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      draw.removeItem(room, uid, itemName);
      io.sockets.in(room).emit('item:remove', uid, itemName);
    });

    // User moves one or more items on their canvas - progress
    socket.on('item:move:progress', function(room, uid, itemNames, delta) {
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      draw.moveItemsProgress(room, uid, itemNames, delta);
      if (itemNames) {
        io.sockets.in(room).emit('item:move', uid, itemNames, delta);
      }
    });

    // User moves one or more items on their canvas - end
    socket.on('item:move:end', function(room, uid, itemNames, delta) {
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      draw.moveItemsEnd(room, uid, itemNames, delta);
      if (itemNames) {
        io.sockets.in(room).emit('item:move', uid, itemNames, delta);
      }
    });

    // User adds a raster image
    socket.on('image:add', function(room, uid, data, position, name) {
      if (requireAuthentication(room) && !checkToken(token, room)) {
        authenticationError(socket, token);
        return;
      }
      draw.addImage(room, uid, data, position, name);
      io.sockets.in(room).emit('image:add', uid, data, position, name);
    });

  });
});

/**
 * Removes a room from the database
 *
 * @param {string} Room to remove
 */
function removeRoom(socket, room) {
  // Double check there is no one else connected to it
  var rooms = socket.adapter.rooms[room], count;
  if (rooms && (count = Object.keys(rooms).length) !== 0) {
    console.log('Removing of room %s aborted, %d still in the room', room,
        count);
    return;
  }
  
  if (projects.projects[room]) {
    // Delete the room from the database
    var project = projects.projects[room].project;
    // All projects share one View, calling remove() on one project destroys the View
    // for all projects. Set to false first.
    project.view = false;
    project.remove();
    delete projects.projects[room];
    console.log('Deleted project for %s', room);
  }

  db.remove(room, function() {
    console.log('Room %s removed from database', room);
  });
}

// Send current project to new client
function loadFromMemory(room, socket) {
  var project = projects.projects[room].project;
  if (!project) { // Additional backup check, just in case
    db.load(room, socket);
    return;
  }
  socket.emit('loading:start');
  var value = project.exportJSON();
  socket.emit('project:load', {project: value});
  socket.emit('loading:end');
}

function loadError(socket) {
  socket.emit('project:load:error');
}

function authenticationError(socket, token) {
  socket.emit('user:authenticate:edit', 'Session expired. Please login again.',
      true);
}

function requireAuthentication(room) {
  if (settings.editPassword) {
    if (typeof settings.editPassword === 'object') {
      return (typeof settings.editPassword[room] !== 'undefined');
    }

    return true;
  }

  return false;
}

var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
var string_length = 10;

function createToken(room) {
  var token, tries = 5;

  do {
    tries--;
    token = '';

    for (var i = 0; i < string_length; i++) {
        var rnum = Math.floor(Math.random() * chars.length);
        token += chars.substring(rnum, rnum + 1);
    }
  } while (tokens[token] && tries > 0);

  if (!tries) {
    throw new Error('Couldn\'t generate token');
  }

  tokens[token] = {
    created: new Date(),
    lastUsed: new Date(),
    rooms: [room] || null
  };

  return token;
}

function checkToken(token, room) {
  if (tokens[token] && (typeof settings.editPassword === 'string'
      || tokens[token].rooms.indexOf(room) !== -1)) {
    tokens[token].lastUsed = new Date();
    return true;
  }

  return false;
}

function removeOldTokens() {
  var cutOff = (new Date()).getTime() - (settings.authenticationTimeout * 1000);

  Object.keys(tokens).forEach(function(token) {
    if (tokens[token].lastUsed.getTime() < cutOff) {
      delete tokens[token];
    }
  });
}
