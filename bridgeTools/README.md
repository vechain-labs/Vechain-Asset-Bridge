bridgeTools
===========



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/bridgeTools.svg)](https://npmjs.org/package/bridgeTools)
[![Downloads/week](https://img.shields.io/npm/dw/bridgeTools.svg)](https://npmjs.org/package/bridgeTools)
[![License](https://img.shields.io/npm/l/bridgeTools.svg)](https://github.com/mongelly/bridgeTools/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g bridgeTools
$ bridgeTools COMMAND
running command...
$ bridgeTools (-v|--version|version)
bridgeTools/1.0.0 darwin-x64 node-v12.22.1
$ bridgeTools --help [COMMAND]
USAGE
  $ bridgeTools COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`bridgeTools hello [FILE]`](#bridgetools-hello-file)
* [`bridgeTools help [COMMAND]`](#bridgetools-help-command)

## `bridgeTools hello [FILE]`

describe the command here

```
USAGE
  $ bridgeTools hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ bridgeTools hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/mongelly/bridgeTools/blob/v1.0.0/src/commands/hello.ts)_

## `bridgeTools help [COMMAND]`

display help for bridgeTools

```
USAGE
  $ bridgeTools help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.2/src/commands/help.ts)_
<!-- commandsstop -->
