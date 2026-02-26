const ldap = require("ldapjs");
console.log("LDAP URL:", process.env.LDAP_URL);
function createClient() {
  return ldap.createClient({
    url: process.env.LDAP_URL,
    reconnect: true,
  });
}

function bind(client, dn, password) {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function search(client, base, options) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      res.on("searchEntry", (entry) => {
        const obj = { dn: entry.dn.toString() };
        entry.attributes.forEach((attr) => {
          const values = attr.values || attr.vals || [];
          obj[attr.type] = values.length === 1 ? values[0] : values;
        });
        entries.push(obj);
      });
      res.on("error", (err) => reject(err));
      res.on("end", () => resolve(entries));
    });
  });
}

// operation: 'add', 'delete', 'replace'
function modify(client, dn, operation, modification) {
  return new Promise((resolve, reject) => {
    try {
      // 1. Convert simple object { title: "Manager" } to LDAP format
      // keys: ['title'], values: ['Manager']
      const type = Object.keys(modification)[0];
      const value = Object.values(modification)[0];

      // 2. Create the Change Object
      const change = new ldap.Change({
        operation: operation, // e.g. 'replace'
        modification: {
          type: type,
          values: Array.isArray(value) ? value : [value] // Ensure array
        }
      });

      // 3. Send to LDAP
      client.modify(dn, change, (err) => {
        if (err) {
          console.error(`LDAP Modify Error [${operation}]:`, err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (e) {
      console.error("Change creation failed:", e);
      reject(e);
    }
  });
}

module.exports = { createClient, bind, search, modify };