import express from "express";
import cors from "cors";
const PORT = 5000;
import { MongoClient, ObjectId } from "mongodb";
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

// Vendor
// app.post("/usersvendor", async (req, res) => {
//   const menuData = req.body;
//   //   console.log("Received Data:", menuData);
//   const result = await usersvendorcollection.insertOne(menuData);
//   res.send(result);
// });

app.post("/usersvendor", async (req, res) => {
  try {
    const menuData = req.body;

    const newMenuItem = {
      ...menuData,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await usersvendorcollection.insertOne(newMenuItem);

    res.status(201).send({
      success: true,
      message: "Menu item submitted for admin approval",
      insertedId: result.insertedId,
      status: newMenuItem.status,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

app.get("/usersvendor", async (req, res) => {
  const result = await usersvendorcollection.find().toArray();
  res.send(result);
});

app.patch("/usersvendor/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const result = await usersvendorcollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update product",
      error: error.message,
    });
  }
});

app.delete("/usersvendor/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await usersvendorcollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Menu item not found",
      });
    }
    res.send({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete menu item",
      error: error.message,
    });
  }
});

// Hello World

// app.get("/usersvendor/featured/:email", async (req, res) => {
//   const email = req.params.email;
//   const result = await usersvendorcollection.find({ email: email }).toArray();
//   res.send(result);
// });

app.get("/usersvendor/featured/:email", async (req, res) => {
  try {
    const email = req.params.email;
    console.log(email);

    const result = await usersvendorcollection.find({ email: email }).toArray();

    console.log(result);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch menu items" });
  }
});

// app.get("/usersvendor/featured", async (req, res) => {
//   try {
//     const today = new Date().toISOString().split("T")[0];

//     const result = await usersvendorcollection
//       .find({
//         date: { $gte: today },
//       })
//       .sort({ date: 1 })
//       .limit(6)
//       .toArray();

//     res.status(200).send(result);
//   } catch (error) {
//     res.status(500).send({
//       message: "Failed to fetch upcoming featured items",
//       error: error.message,
//     });
//   }
// });

// app.get("/usersvendor/featured", async (req, res) => {
//   const today = new Date().toISOString().split("T")[0];

//   const result = await usersvendorcollection
//     .find({ date: { $gte: today } })
//     .sort({ date: 1 })
//     .limit(6)
//     .toArray();

//   res.send(result);
// });

// app.delete("/usersvendor/:id", async (req, res) => {
//   const { id } = req.params;
//   const result = await usersvendorcollection.deleteOne({
//     _id: new ObjectId(id),
//   });
//   res.json(result);
// });

// app.get("/usersvendor", async (req, res) => {
//   try {
//     const email = req.query.email;

//     const result = await menuItemsCollection
//       .find({ vendorEmail: email })
//       .sort({ createdAt: -1 })
//       .limit(5)
//       .toArray();

//     res.send(result);
//   } catch (error) {
//     res.status(500).send({
//       message: error.message,
//     });
//   }
// });

// http://localhost:5000
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
