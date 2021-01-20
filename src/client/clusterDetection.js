const kmeans = require("node-kmeans");
const fs = require("fs");
var path = require("path");

var jsonPath = path.join(__dirname, "..", "..", "data", "covid_data.json");
let rawdata = fs.readFileSync(jsonPath);
let cases = JSON.parse(rawdata);
let startDate = new Date("2020-03-19");
let vectors = new Array();
let minLat = Number.MAX_VALUE;
let maxLat = -Number.MAX_VALUE;
let minLon = Number.MAX_VALUE;
let maxLon = -Number.MAX_VALUE;
let maxDays = -Number.MAX_VALUE;
for (let i = 0; i < cases.length; i++) {
  var date2 = new Date(cases[i].date);
  var diffDays = (date2 - startDate) / (1000 * 60 * 60 * 24);
  if (cases[i]["lon"] > maxLon) {
    maxLon = cases[i]["lon"];
  }
  if (cases[i]["lon"] < minLon) {
    minLon = cases[i]["lon"];
  }
  if (cases[i]["lat"] > maxLat) {
    maxLat = cases[i]["lat"];
  }
  if (cases[i]["lat"] < minLat) {
    minLat = cases[i]["lat"];
  }
  if (diffDays > maxDays) {
    maxDays = diffDays;
  }
  cases[i].diffDays = diffDays;
  //vectors[i] = [cases[i]["lon"], cases[i]["lat"], diffDays];
}

for (let i = 0; i < cases.length; i++) {
  let normLat = (cases[i]["lat"] - minLat) / (maxLat - minLat);
  let normLon = (cases[i]["lon"] - minLon) / (maxLon - minLon);
  let normDays = cases[i].diffDays / maxDays;
  vectors[i] = [normLon, normLat, normDays];
}

kmeans.clusterize(vectors, { k: 100 }, (err, res) => {
  if (err) console.error(err);
  else {
    for (let cluster of res) {
      for (let points of cluster.cluster) {
        points[0] = points[0] * (maxLon - minLon) + parseFloat(minLon);
        points[1] = points[1] * (maxLat - minLat) + parseFloat(minLat);
        points[2] = points[2] * maxDays;
      }
    }
    let data = JSON.stringify(res);
    fs.writeFileSync("data/clusters100.json", data);
  }
});
