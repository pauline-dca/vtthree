const kmeans = require("node-kmeans");
const fs = require("fs");
var path = require("path");

var jsonPath = path.join(__dirname, "..", "..", "data", "covid_data.json");
let rawdata = fs.readFileSync(jsonPath);
let cases = JSON.parse(rawdata);
let startDate = new Date("2020-03-19");
let vectors = new Array();
for (let i = 0; i < cases.length; i++) {
  var date2 = new Date(cases[i].date);
  var diffDays = (date2 - startDate) / (1000 * 60 * 60 * 24);
  vectors[i] = [cases[i]["lon"], cases[i]["lat"], diffDays];
}

kmeans.clusterize(vectors, { k: 10 }, (err, res) => {
  if (err) console.error(err);
  else console.log("%o", res);
  let data = JSON.stringify(res);
  fs.writeFileSync("data/clusters.json", data);
});
