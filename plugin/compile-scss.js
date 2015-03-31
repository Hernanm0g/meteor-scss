var path = Npm.require('path');
var sass = Npm.require('node-sass');
var fs   = Npm.require('fs');
var _    = Npm.require('lodash');

var autoprefixer = Npm.require('autoprefixer-core');

var generatedIndexMessage = [
  "// This file is auto generated by the scss package",
  "// New .scss and .sass files will be automatically '@import'ed  at the bottom",
  "// Existing content in the file will not be touched",
  "// When deleting a .scss or .sass file you must manually delete it from here",
  "",
  ""
].join("\n");

var CONFIG_FILE_NAME = 'scss.json';

var projectOptionsFile = path.resolve(process.cwd(), CONFIG_FILE_NAME);

var loadJSONFile = function (filePath) {
  var content = fs.readFileSync(filePath);
  try {
    return JSON.parse(content);
  }
  catch (e) {
    console.log("Error: failed to parse ", filePath, " as JSON");
    return {};
  }
};

var sourceHandler = function(compileStep) {
  // Don't process partials
  if ( path.basename(compileStep.inputPath)[0] === '_' )
    return;
  // XXX annoying that this is replicated in .css, .less, and .styl
  var basePath = compileStep.fullInputPath.slice(0, -compileStep.inputPath.length);
  // If a package has a scss.json file this takes precedence.
  var packageOptionsFile = path.resolve(basePath, CONFIG_FILE_NAME);

  var scssOptions = {};

  if (fs.existsSync(packageOptionsFile)) {
    scssOptions = loadJSONFile(packageOptionsFile);
  } else if (fs.existsSync(projectOptionsFile)) {
    scssOptions = loadJSONFile(projectOptionsFile);
  } else if (compileStep.fileOptions && compileStep.fileOptions.testOptions) {
    scssOptions = compileStep.fileOptions.testOptions;
  }

  if ( scssOptions.useIndex ) {
    var indexFilePath = scssOptions.indexFilePath || "index.scss";
    // If this isn't the index file, add it to the index if need be
    if ( compileStep.inputPath != indexFilePath ) {
      if ( fs.existsSync(indexFilePath) ) {
        var scssIndex = fs.readFileSync(indexFilePath, 'utf8');
        if (scssIndex.indexOf(compileStep.inputPath) == -1) {
          fs.appendFileSync(indexFilePath, '\n@import "' + compileStep.inputPath + '";', 'utf8');
        }
      } else {
        var newFile = generatedIndexMessage + '@import "' + compileStep.inputPath + '";\n';
        fs.writeFileSync(indexFilePath, newFile, 'utf8');
      }
      return; // stop here, only compile the indexFile
    }
  }

  var options = _.extend({
    sourceMap:         true,
    // These are the magic incantations for sass sourcemaps
    sourceMapContents: true,
    sourceMapEmbed:    true,
    outFile:           compileStep.pathForSourceMap,
    includePaths:      []
  }, scssOptions);

  options.file  = compileStep.fullInputPath;

  if ( !_.isArray(options.includePaths) ) {
    options.includePaths = [options.includePaths];
  }

  // Convert relative paths supplied via the options file to absolute paths.
  options.includePaths = _.map(options.includePaths, function(includePath) {
    return path.resolve(basePath, includePath);
  });

  options.includePaths = options.includePaths.concat(path.dirname(compileStep.fullInputPath));

  var result;
  try {
    result = sass.renderSync(options);
  } catch (error) {
    e = JSON.parse(error);  // error should be an object, not a string, if using render
                            // guess it hasn't been implemented for renderSync
    return compileStep.error({
      message: "Scss compiler error: " + e.message + "\n",
      sourcePath: e.file || compileStep.inputPath,
      line: e.line,
      column: e.column
    });
  }

  if ( options.enableAutoprefixer) {
    var autoprefixerOptions = options.autoprefixerOptions || {}
    var autoprefixerProcessingOptions = {
      from: compileStep.inputPath,
      to: compileStep.inputPath + ".css",
      map: true
    };
    try {
      // Applying Autoprefixer to compiled css
      var processor      = autoprefixer(autoprefixerOptions);
      var prefixedOutput = processor.process(result.css, autoprefixerProcessingOptions);
      result.css         = prefixedOutput.css;
    } catch (e) {
      compileStep.error({
        message: "Autoprefixer error: " + e,
        sourcePath: e.filename || compileStep.inputPath
      });
    }
  }
  compileStep.addStylesheet({
    path: compileStep.inputPath + ".css",
    data: result.css
  });
};

Plugin.registerSourceHandler("scss", {archMatching: 'web'}, sourceHandler);
Plugin.registerSourceHandler("sass", {archMatching: 'web'}, sourceHandler);

Plugin.registerSourceHandler("scssimport", function () {
  // Do nothing
});
