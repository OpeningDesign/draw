var async = require('async');
var fs = require('fs');

exports.specsList = function(callback){
  async.parallel({
    coreSpecs: function(callback){
      exports.getCoreTests(callback);
    },
    pluginSpecs: function(callback){
      exports.getPluginTests(callback);
    }
  },
  function(err, results){
    var files = results.coreSpecs; // push the core specs to a file object
    files = files.concat(results.pluginSpecs); // add the plugin Specs to the core specs
    //console.debug("Sent browser the following test specs:", files.sort());
    // console.log("Sent browser the following test specs:", files.sort());
    // res.send("var specs_list = " + JSON.stringify(files.sort()) + ";\n");
    callback(files.sort());
  });
}

exports.getPluginTests = function(callback){
  var pluginSpecs = [];
  var plugins = fs.readdirSync('node_modules');
  plugins.forEach(function(plugin){
    if(fs.existsSync("node_modules/"+plugin+"/static/tests/frontend/specs")){ // if plugins exists
      var specFiles = fs.readdirSync("node_modules/"+plugin+"/static/tests/frontend/specs/");
      async.forEach(specFiles, function(spec){ // for each specFile push it to pluginSpecs
         pluginSpecs.push("/static/plugins/"+plugin+"/static/tests/frontend/specs/" + spec);
      },
      function(err){
         // blow up if something bad happens!
      });
    }
  });
  callback(null, pluginSpecs);
}

exports.getCoreTests = function(callback){
  fs.readdir('tests/frontend/specs', function(err, coreSpecs){ // get the core test specs
    if(err){ return res.send(500); }
    callback(null, coreSpecs);
  });
}
