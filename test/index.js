'use strict';

/*eslint func-names: 0*/
var Code = require('code');
var Lab = require('lab');
var WS = require('ws');
var debug = require('debug');
var JsonRpcWs = require('../');
var Browserify = require('browserify');
var selenium = require('selenium-webdriver');
var fs = require('fs');

debug.enable('json-rpc-ws');

Code.settings.truncateMessages = false;
var lab = exports.lab = Lab.script();

lab.experiment('json-rpc ws', function ()
{

  var server = JsonRpcWs.createServer();
  var client = JsonRpcWs.createClient();
  var delayBuffer = [];

  lab.before(function (done)
  {

    server.expose('reflect', function (params, reply)
    {
      reply(null, params || 'empty');
    });
    server.expose('delay', function (params, reply)
    {

      var last;
      if (delayBuffer.length > 0)
      {
        last = delayBuffer.pop();
        last[1](null, last[0][0]);
      }
      delayBuffer.push(arguments);
    });
    server.expose('error', function (params, reply)
    {

      reply('error', null);
    });
    server.expose('browserClient', function (params, reply)
    {

      reply(null, this.id);
    });

    server.start({ host: 'localhost', port: 8081 }, function ()
    {

      client.connect('ws://localhost:8081', done);
    });
  });

  lab.after(function (done)
  {

    client.disconnect(function ()
    {

      server.stop();
      done();
    });
  });

  lab.test('client has an id', function (done)
  {

    Code.expect(client.id).to.not.equal(undefined);
    done();
  });

  lab.test('reflecting handler', function (done)
  {

    client.send('reflect', ['test one'], function (error1, reply1)
    {

      Code.expect(error1).to.equal(undefined);
      Code.expect(reply1).to.have.length(1);
      Code.expect(reply1[0]).to.equal('test one');
      client.send('reflect', ['test two'], function (error2, reply2)
      {

        Code.expect(error2).to.equal(undefined);
        Code.expect(reply2).to.have.length(1);
        Code.expect(reply2[0]).to.equal('test two');
        client.send('reflect', null, function (error3, reply3)
        {

          Code.expect(error3).to.equal(undefined);
          Code.expect(reply3).to.equal('empty');
          client.send('reflect', undefined, function (error4, reply4)
          {

            Code.expect(error4).to.equal(undefined);
            Code.expect(reply4).to.equal('empty');
            done();
          });
        });
      });
    });
  });

  lab.test('error reply', function (done)
  {

    client.send('error', null, function (error, reply)
    {

      Code.expect(reply).to.equal(undefined);
      Code.expect(error).to.equal('error');
      done();
    });
  });

  lab.test('delay handler', function (done)
  {

    var counter = 0;
    client.send('delay', ['test one'], function (error, reply)
    {

      Code.expect(counter).to.equal(0);
      counter = counter + 1;
      Code.expect(reply).to.equal('test one');
    });
    client.send('delay', ['test two'], function (error, reply)
    {

      Code.expect(counter).to.equal(1);
      Code.expect(reply).to.equal('test two');
      done();
    });
    client.send('delay', ['test three']);
  });

  lab.test('cannot register duplicate handler', function (done)
  {

    Code.expect(function ()
    {

      server.expose('reflect', function (params, reply)
      {

        reply();
      });
    }).to.throw(Error);
    done();
  });

  lab.test('hasHandler', function (done)
  {

    Code.expect(server.hasHandler('reflect')).to.equal(true);
    Code.expect(server.hasHandler('nonexistant')).to.equal(false);
    done();
  });

  lab.test('connection Ids', function (done)
  {

    var connectionId;
    server.expose('saveConnection', function (params, reply)
    {

      Code.expect(this.id).to.not.equal(undefined);
      connectionId = this.id;
      reply(null, 'ok');
    });
    client.expose('info', function (params, reply)
    {

      Code.expect(params).to.equal(undefined);
      reply(null, 'info ok');
    });
    client.send('saveConnection', null, function ()
    {

      Code.expect(connectionId).to.not.equal(undefined);
      Code.expect(server.getConnection(connectionId)).to.not.equal(undefined);
      server.send(connectionId, 'info', null, function (err, result)
      {

        Code.expect(result).to.equal('info ok');
        done();
      });
    });
  });
  lab.test('invalid connection id', function (done)
  {

    server.send(0, 'info', undefined); //No callback is ok
    server.send(0, 'info', undefined, function (err, result)
    {

      Code.expect(result).to.equal(undefined);
      Code.expect(err).to.include(['code', 'message']);
      Code.expect(err.code).to.equal(-32000);
      done();
    });
  });
  lab.test('stream', function (done)
  {
    fs.stat(__filename, function (err, stats)
    {
      debugger;
      client.send('reflect', fs.createReadStream(__filename, { highWaterMark: 128 }), function (err, result)
      {
        Code.expect(err).to.be.undefined();
        var receivedStats = 0;
        result.on('data', function (chunk)
        {
          receivedStats += chunk.length;
          // console.log(chunk);
        })
        result.on('end', function ()
        {
          Code.expect(receivedStats).equals(stats.size);
          console.log('end');
          done();
        })
      })
    });
  });
  lab.test('invalid payloads do not throw exceptions', function (done)
  {

    //This is for code coverage in the message handler to make sure rogue messages won't take the server down.;
    var socket = new WS('ws://localhost:8081');
    socket.on('open', function ()
    {

      //TODO socket callbacks + socket.once('message') with response validation for each of these instead of this setTimeout nonsense
      socket.send('asdf\n');
      socket.send('{}\n');
      socket.send('{"jsonrpc":"2.0"}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect"}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "id":null}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "id":"asdf"}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "id":0}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "id":[0]}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "params":null}\n');
      socket.send('{"jsonrpc":"2.0", "method":"reflect", "id":null, "params":null}\n');
      socket.send('{"jsonrpc":"2.0", "error":{"code": -32000, "message":"Server error"}}\n');
      socket.send('{"jsonrpc":"2.0", "id":"asdf", "result":"test"}\n');
      socket.send('[{"jsonrpc":"2.0", "result":"test"},{"jsonrpc":"2.0", "result":"rest"}]');
      setTimeout(done, 100);
    });
  });
  lab.test('client.send', function (done)
  {

    //No callback
    client.send('reflect', null); //Valid method
    client.send('nonexistant', null); //Unexposed method
    Code.expect(function ()
    {

      client.send(1, null); //Invalid method
    }).to.throw(Error);
    done();
  });
  lab.test('client hangups', function (done)
  {

    var clientA = JsonRpcWs.createClient();
    var clientB = JsonRpcWs.createClient();
    //With and without callbacks;
    clientA.connect('ws://localhost:8081', function ()
    {

      clientA.disconnect(function ()
      {

        clientB.connect('ws://localhost:8081', function ()
        {

          clientB.disconnect();
          done();
        });
      });

    });
  });
  lab.test('server.start without callback', function (done)
  {

    var serverA = JsonRpcWs.createServer();
    serverA.start({ port: 8082 });
    serverA.server.once('listening', done);
  });

  lab.test('errors', function (done)
  {

    var payload;
    payload = JsonRpcWs.Errors('parseError');
    Code.expect(payload.id).to.equal(undefined);
    Code.expect(payload.error).to.include(['code', 'message']);
    Code.expect(payload.error.data).to.equal(undefined);
    payload = JsonRpcWs.Errors('parseError', 'a');
    Code.expect(payload.id).to.equal('a');
    Code.expect(payload.error).to.include(['code', 'message']);
    Code.expect(payload.error.data).to.equal(undefined);
    payload = JsonRpcWs.Errors('parseError', 'b', { extra: 'data' });
    Code.expect(payload.id).to.equal('b');
    Code.expect(payload.error).to.include(['code', 'message']);
    Code.expect(payload.error.data).to.equal({ extra: 'data' });
    done();
  });

  lab.experiment('browser', function ()
  {

    var script;
    lab.before(function (done)
    {
      var b = Browserify();
      b.add('./browser_test.js');
      b.bundle(function (err, buf)
      {

        Code.expect(err).to.not.exist();
        script = buf.toString();
        done();
      });
    });

    lab.test.skip('works in browser', { timeout: 700000 }, function (done)
    {
      Code.expect(script).to.not.equal('');
      //setup custom phantomJS capability
      var phantomjs_exe = require('phantomjs-prebuilt').path;
      var customPhantom = selenium.Capabilities.phantomjs();
      customPhantom.set("phantomjs.binary.path", phantomjs_exe);

      var prefs = new selenium.logging.Preferences();
      prefs.setLevel(selenium.logging.Type.BROWSER, selenium.logging.Level.ALL);
      prefs.setLevel(selenium.logging.Type.CLIENT, selenium.logging.Level.ALL);
      prefs.setLevel(selenium.logging.Type.DRIVER, selenium.logging.Level.ALL);
      prefs.setLevel(selenium.logging.Type.SERVER, selenium.logging.Level.ALL);
      var logger = selenium.logging.getLogger();
      selenium.logging.addConsoleHandler();
      // logger.addHandler(function ()
      // {
      //   console.log(arguments);
      // })
      customPhantom.setLoggingPrefs(prefs)
      //build custom phantomJS driver
      var driver = new selenium.Builder().
        withCapabilities(customPhantom).
        build();

      debugger;

      driver.executeScript(script).then(function ()
      {
        driver.executeScript(function ()
        {
          window.result = null;
          var callback = arguments[arguments.length - 1];
          browserClient.connect('ws://localhost:8081', function ()
          {
            window.result = arguments;
            browserClient.send('browserClient', ['browser', 'client'], function (err, reply)
            {
              window.result = [err, reply];
            });
          });
        });
        driver.wait(function ()
        {
          return driver.executeScript(function ()
          {
            return window.result != null
          })
        }, 10000).then(function ()
        {
          debugger;
          driver.executeScript(function ()
          {
            return window.result;
          }).then(function (response)
          {
            console.log('response');
            var err = response[0];
            var browserId = response[1];
            Code.expect(browserId).to.not.equal(undefined);
            Code.expect(err).to.equal(null);
            server.send(browserId, 'info', null, function (err, result)
            {
              Code.expect(err).to.equal(undefined);
              Code.expect(result).to.equal('browser');
              driver.quit();
              done();
            });
          }, function (rejection)
            {
              Code.expect(rejection).to.not.exist();
            });
        })
      });
    });

  });
});
