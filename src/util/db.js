var settings = require('./Settings.js'),
    projects = require('./projects.js'),
     ueberDB = require('ueberDB')

// Database connection
var db = new ueberDB.database(settings.dbType, settings.dbSettings);

var initCalled = false;

// Init..
exports.init = function(callback) {
  if (initCalled) {
    return false;
  }

  if (callback && callback instanceof Function) { 
    db.init(callback);
  } else {
    db.init(function(err){
      if(err){
        console.error(err);
      }
    });
  }

  initCalled = true;
  return true;
}

/**
 * Get the list of rooms currently in the database
 *
 * @returns {Array} An array of rooms
 */
exports.rooms = function(callback, search) {
  if (!initCalled) {
    throw new Error('DB initialisation not called before call of rooms()')
  }
  if (!search) {
    search = '*';
  }
  db.findKeys(search, null, function(err, keys) {
    if (err) {
      callback(err, keys);
    }

    var k, valuedKeys = [];
    var count = 1;

    for (k in keys) {
      count++;
      db.get(keys[k], (function(k) { return function(err, val) {
        if (val) {
          valuedKeys.push(keys[k]);
        }
        count--;
        
        if (!count) {
          callback(null, valuedKeys);
        }
      }})(k));
    }
    count--;
    if (!count) {
      callback(null, valuedKeys);
    }
  });
}

exports.remove = function(room, callback) {
  db.remove(room, callback);
}

// Write to teh database
exports.storeProject = function(room) {
  if (!initCalled) {
    throw new Error('DB initialisation not called before call of store()')
  }
  var project = projects.projects[room].project;
  var json = project.exportJSON();
  console.log("Writing project to database");
  db.set(room, {project: json});
}

// Try to load room from database
exports.load = function(room, socket) {
  if (!initCalled) {
    throw new Error('DB initialisation not called before call of load()')
  }
  console.log("load from db");
  if (projects.projects[room] && projects.projects[room].project) {
    var project = projects.projects[room].project;
    db.get(room, function(err, value) {
      if (value && project && project.activeLayer) {
        socket.emit('loading:start');
        // Clear default layer as importing JSON adds a new layer.
        // We want the project to always only have one layer.
        project.activeLayer.remove();
        project.importJSON(value.project);
        socket.emit('project:load', value);
      }
      socket.emit('loading:end');
    });
    socket.emit('loading:end'); // used for sending back a blank database in case we try to load from DB but no project exists
  } else {
    loadError(socket);
  }
}

exports.db = db;
