/**
 * If you want to get typehints, you can use JSDoc comments like so:
 * 
 * @typedef {import('../src/hermes_agent/heresy').Heresy} Heresy
 * @typedef {import('../src/hermes_agent/heresy').HeresyEvent} HeresyEvent
 */

/** @type {Heresy} */
let h = globalThis.heresy

// Log full HTTP requests and responses
h.http_callback = (event) => {
  let req = event.request;
  let res = event.response;

  if (req.method === 'POST') {
    console.log('POST request was logged by heresy');

    Object.keys(req.headers).forEach((key) => {
      console.log(key + ': ' + req.headers[key]);
    });

    console.log('The response status code: ' + res.status);
  }
};

// Show an alert!
h.alert('Hello, world!')

// Log the contents of this.process, which contains NODE_ENV
h.dump_env();

// Make a POST request to httpbin.org.
fetch('https://httpbin.org/anything', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      foo: 'bar',
    })
  })
  .then(response => {
    return response.text();
  })
  .then(data => {
    console.log('Got data!');
    console.log(data)
  }).catch((error) => {
    console.log(error)
    console.log(error.message)
  });