/*@preserve Copyright (C) 2021-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Expand environment variables in the data string. Only works
 * under node.js, using `process`.
 * @param {string} data string containing env var references
 * @return {string} argument string with env vars expanded
 */
function expandEnv(data) {
  const rep = function (match, v) {
    if (typeof process.env[v] !== "undefined")
      return process.env[v];
    return match;
  };
  data = ("" + data).replace(/^~/, "${HOME}");
  return data
  .replace(/\$([A-Z]+)/g, rep)
  .replace(/\$\{([^}]+)\}/g, rep);
}

export { expandEnv }
