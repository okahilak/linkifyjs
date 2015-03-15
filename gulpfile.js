var gulp = require('gulp'),
amdOptimize = require('amd-optimize'),
glob = require('glob'),
karma = require('karma').server,
path = require('path'),
stylish = require('jshint-stylish'),
tlds = require('./tlds');

var // Gulp plugins
concat			= require('gulp-concat'),
closureCompiler	= require('gulp-closure-compiler'),
istanbul		= require('gulp-istanbul'),
jshint			= require('gulp-jshint'),
mocha			= require('gulp-mocha'),
rename			= require('gulp-rename'),
replace			= require('gulp-replace'),
babel			= require('gulp-babel'), // formerly 6to5
uglify			= require('gulp-uglify'),
wrap			= require('gulp-wrap');

var paths = {
	src: 'src/**/*.js',
	lib: 'lib/**/*.js',
	libCore: [
		'lib/linkify/core/*.js',
		'lib/linkify/utils/*.js',
		'lib/linkify.js'
	],
	amd: 'build/amd/**/*.js',
	test: 'test/index.js',
	spec: 'test/spec/**.js'
};

var babelformat = {
	comments: true,
	indent: {
		style: '	'
	}
};

var tldsReplaceStr = '"' + tlds.join('|') + '".split("|")';

/**
	ES6 ~> babel (with CJS Node Modules)
	This populates the `lib` folder, allows usage with Node.js
*/
gulp.task('babel', function () {
	return gulp.src(paths.src)
	.pipe(replace('__TLDS__', tldsReplaceStr))
	.pipe(babel({format: babelformat}))
	.pipe(gulp.dest('lib'));
});

/**
	ES6 to babel AMD modules
*/
gulp.task('babel-amd', function () {

	gulp.src(paths.src)
	.pipe(replace('__TLDS__', tldsReplaceStr))
	.pipe(babel({
		modules: 'amd',
		moduleIds: true,
		format: babelformat
		// moduleRoot: 'linkifyjs'
	}))
	.pipe(gulp.dest('build/amd')) // Required for building plugins separately
	.pipe(amdOptimize('linkify'))
	.pipe(concat('linkify.amd.js'))
	.pipe(gulp.dest('build'));
	// Plugins
	// gulp
});

// Build core linkify.js
// Closure compiler is used here since it can correctly concatenate CJS modules
gulp.task('build-core', function () {

	gulp.src(paths.libCore)
	.pipe(closureCompiler({
		compilerPath: 'node_modules/closure-compiler/lib/vendor/compiler.jar',
		fileName: 'build/.closure-output.js',
		compilerFlags: {
			process_common_js_modules: null,
			common_js_entry_module: 'lib/linkify',
			common_js_module_path_prefix: path.join(__dirname, 'lib'),
			formatting: 'PRETTY_PRINT'
		}
	}))
	.pipe(wrap({src: 'templates/linkify.js'}))
	.pipe(rename(function (path) {
		// Required due to closure compiler
		path.dirname = '.';
		path.basename = 'linkify';
	}))
	.pipe(gulp.dest('build'));
});

// Build root linkify interfaces (files located at the root src folder other
// than linkify.js)
// Depends on build-core
gulp.task('build-interfaces', function () {

	// Core linkify functionality as plugins
	var interface, interfaces = [
		'string',
		'element',
		// ['element', 'jquery'] // jQuery interface requires both element and jquery
	];

	var files = {js: null, amd: null};

	// Globals browser interface
	for (var i = 0; i < interfaces.length; i++) {
		interface = interfaces[i];

		if (interface instanceof Array) {
			// Interface has dependencies
			files.js = [];
			files.amd = [];
			for (var j = 0; j < interface.length; j++) {
				files.js.push('src/linkify-' + interface[i] + '.js');
				files.amd.push('build/amd/linkify-' + interface[i] + '.js');
			}

			// The last dependency is the name of the interface
			interface = interface.pop();

		} else {
			files.js = 'src/linkify-' + interface + '.js';
			files.amd = 'build/amd/linkify-' + interface + '.js';
		}

		// Browser interface
		gulp.src(files.js)
		.pipe(babel({
			modules: 'ignore',
			format: babelformat
		}))
		.pipe(wrap({src: 'templates/linkify-' + interface + '.js'}))
		.pipe(concat('linkify-' + interface + '.js'))
		.pipe(gulp.dest('build'));

		// AMD interface
		gulp.src(files.amd)
		.pipe(wrap({src: 'templates/linkify-' + interface + '.amd.js'}))
		.pipe(concat('linkify-' + interface + '.amd.js'))
		.pipe(gulp.dest('build'));
	}

});

/**
	NOTE - Run 'babel' and 'babel-amd' first
*/
gulp.task('build-plugins', function () {

	// Get the filenames of all available plugins
	var
	plugin,
	plugins = glob.sync('*.js', {
		cwd: path.join(__dirname, 'src', 'linkify', 'plugins')
	}).map(function (plugin) {
		return plugin.replace(/\.js$/, '');
	});

	// Browser plugins
	for (var i = 0; i < plugins.length; i++) {
		plugin = plugins[i];

		// Global plugins
		gulp.src('src/linkify/plugins/' + plugin + '.js')
		.pipe(babel({
			modules: 'ignore',
			format: babelformat
		}))
		.pipe(wrap({src: 'templates/linkify/plugins/' + plugin + '.js'}))
		.pipe(concat('linkify-plugin-' + plugin + '.js'))
		.pipe(gulp.dest('build'));

		// AMD plugins
		gulp.src('build/amd/linkify/plugins/' + plugin + '.js')
		.pipe(wrap({src: 'templates/linkify/plugins/' + plugin + '.amd.js'}))
		.pipe(concat('linkify-plugin-' + plugin + '.amd.js'))
		.pipe(gulp.dest('build'));

	}

	// AMD Browser plugins
	for (i = 0; i < plugins.length; i++) {
		plugin = plugins[i];
	}

});

// Build steps

/**
	Lint using jshint
*/
gulp.task('jshint', function () {
	gulp.src([paths.src, paths.test, paths.spec])
	.pipe(jshint())
	.pipe(jshint.reporter(stylish))
	.pipe(jshint.reporter('fail'));
});

/**
	Run mocha tests
*/
gulp.task('mocha', function () {
	return gulp.src(paths.test, {read: false})
	.pipe(mocha());
});

/**
	Code coverage reort for mocha tests
*/
gulp.task('coverage', function (cb) {
	gulp.src(paths.lib)
	.pipe(istanbul()) // Covering files
	.pipe(istanbul.hookRequire()) // Force `require` to return covered files
	.on('finish', function () {
		gulp.src(paths.test, {read: false})
		.pipe(mocha())
		.pipe(istanbul.writeReports()) // Creating the reports after tests runned
		.on('end', cb);
	});
});

gulp.task('karma', function () {
	return karma.start({
		configFile: __dirname + '/test/dev.conf.js',
		singleRun: true
	});
});

gulp.task('karma-chrome', function () {
	karma.start({
		configFile: __dirname + '/test/chrome.conf.js',
	});
});

gulp.task('karma-ci', function () {
	karma.start({
		configFile: __dirname + '/test/ci.conf.js',
		singleRun: true
	});
});

gulp.task('uglify', function () {
	gulp.src('build/*.js')
	.pipe(gulp.dest('dist')) // non-minified copy
	.pipe(rename(function (path) {
		path.extname = '.min.js';
	}))
	.pipe(uglify())
	.pipe(gulp.dest('dist'));
});

gulp.task('build', [
	'babel',
	'babel-amd',
	'build-core',
	'build-interfaces',
	'build-plugins'
]);

gulp.task('dist', ['build', 'uglify']);

gulp.task('test', ['jshint', 'build', 'mocha']);
gulp.task('test-ci', ['karma-ci']);
// Using with other tasks causes an error here for some reason

/**
	Build JS and begin watching for changes
*/
gulp.task('default', ['babel'], function () {
	gulp.watch(paths.src, ['babel']);
});
