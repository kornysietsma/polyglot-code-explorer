# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.6.0-alpha.1] - 2022-08-18

### Changed

- Moved to Typescript, more recent versions of all dependencies
- Changed data file formats to make them work better with typescript
- added Teams and Aliases for users - many changes including new modal dialogs
- removed code ownership entirely - it didn't work well, will replace with something more team oriented
- moved styling to simpler non-component model, using css variables and some SASS for nested selectors
- Team visualisation and team-based stats all over the place
- Saving and loading state from file and browser local storage
- Can ignore users (useful to stop bot users affecting stats)
- Patterned visualisation for viewing top teams

## [0.5.0] - 2021-04-03

### Changed

- Minor version bump as file format has changed incompatibly - new coupling data is finer grained
- Changed coupling UI for new fine-grained coupling logic

## [0.4.3] - 2020-10-25

### Changed

- Fixed date scale, so it starts and ends one day earlier/later - otherwise sometimes had problems if commits happened on the very last day in the range.

## [0.4.2] - 2020-10-13

### Changed

- Tweaks to code ownership - show biggest file groups first
- added ability to customise the URL used when opening files in a new window, so you can browse files on git hosting with urls unlike the github ones.

## [0.4.1] - 2020-10-11

### Added

- Experimental code ownership visualisation - a work in progress, currently quite slow on big git histories

## [0.4.0] - 2020-10-09

### Added

- source code inspector - needs you to be running [the simple code server](https://github.com/kornysietsma/simple-code-server) or other CORS-enabled way to server up source code files

### Changed

- moved some config behind an 'advanced' panel as the UI was getting cluttered

## [0.3.1] - 2020-09-01

### Added

- very basic dark/light colour themes

## [0.3.0] - 2020-09-01

### Added

- this changelog!
- Using github actions to publish releases
- First packaged release with published site

### Changed

- bumped version to 0.3.0 as I haven't changed versions for a while!
