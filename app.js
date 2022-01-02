const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();
app.use(express.json());
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Sever Running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const convertStateDBObjectTOResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDBToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "randomkey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
SELECT * 
FROM user 
WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const IsPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (IsPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "randomkey");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStateQuery = `
                    SELECT * From state`;
  const stateArray = await db.all(getAllStateQuery);
  response.send(
    stateArray.map((eachState) =>
      convertStateDBObjectTOResponseObject(eachState)
    )
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getAllStateQuery = `
                    SELECT * From state
                    WHERE state_id = ${stateId} `;
  const stateArray = await db.get(getAllStateQuery);
  response.send(convertStateDBObjectTOResponseObject(stateArray));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const InsertDistrictDetailQuery = `
    INSERT INTO district (
        district_name,
        state_id,
        cases,
        cured,
        active,
        deaths
    ) 
     VALUES (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );`;
  await db.run(InsertDistrictDetailQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getAllStateQuery = `
                    SELECT * From district
                    WHERE district_id = ${districtId} `;
    const districtArray = await db.get(getAllStateQuery);
    response.send(convertDistrictDBToResponseObject(districtArray));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
                    DELETE From district
                    WHERE district_id = ${districtId} `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetailQuery = `
    UPDATE district 
     SET 
        district_name ='${districtName}',
      state_id = ${stateId},
       cases = ${cases},
      cured = ${cured},
       active = ${active},
       deaths = ${deaths}
   WHERE district_id = ${districtId};`;
    await db.run(updateDistrictDetailQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatesStats = `
    SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM district WHERE 
    state_id = ${stateId};`;
    const stateStats = await db.get(getStatesStats);
    response.send({
      totalCases: stateStats["SUM(cases)"],
      totalCured: stateStats["SUM(cured)"],
      totalActive: stateStats["SUM(active)"],
      totalDeaths: stateStats["SUM(deaths)"],
    });
  }
);

module.exports = app;
