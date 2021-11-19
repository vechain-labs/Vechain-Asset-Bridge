validationnode
==============



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/validationnode.svg)](https://npmjs.org/package/validationnode)
[![Downloads/week](https://img.shields.io/npm/dw/validationnode.svg)](https://npmjs.org/package/validationnode)
[![License](https://img.shields.io/npm/l/validationnode.svg)](https://github.com/mongelly/validationnode/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g validationnode
$ validationnode COMMAND
running command...
$ validationnode (-v|--version|version)
validationnode/1.0.0 darwin-x64 node-v12.22.1
$ validationnode --help [COMMAND]
USAGE
  $ validationnode COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`validationnode hello [FILE]`](#validationnode-hello-file)
* [`validationnode help [COMMAND]`](#validationnode-help-command)

## `validationnode hello [FILE]`

describe the command here

```
USAGE
  $ validationnode hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ validationnode hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/mongelly/validationnode/blob/v1.0.0/src/commands/hello.ts)_

## `validationnode help [COMMAND]`

display help for validationnode

```
USAGE
  $ validationnode help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.2/src/commands/help.ts)_
<!-- commandsstop -->
