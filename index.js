import express from "express";
import cors from "cors";
const PORT = 5000;
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();
// app.use(cors());
app.use(
  cors({
    origin: `${process.env.CLIENT_URL}`,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const db = connectedClient.db("pizzahub");
const usersvendorcollection = db.collection("usersvendor");

app.post("/usersvendor", async (req, res) => {
  const menuData = req.body;
  //   console.log("Received Data:", menuData);
  const result = await usersvendorcollection.insertOne(menuData);
  res.send(result);
});

// http://localhost:5000
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
