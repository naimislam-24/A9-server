import express from "express";
import cors from "cors";
const PORT = 5000;
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { jwtVerify, createRemoteJWKSet } from "jose";

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
const usersordercollection = db.collection("usersorder");
const userscollection = db.collection("user");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }
  const JWKS = createRemoteJWKSet(
    new URL("http://localhost:3000/api/auth/jwks"),
  );
  try {
    const { payload } = await jwtVerify(token, JWKS);
    // payload ta vinno jaygay use korbo
    next();
  } catch (error) {
    return res.status(500).send({ msg: "Server Error" });
  }
};

app.post("/usersvendor", verifyToken, async (req, res) => {
  try {
    const menuData = req.body;
    const newMenuItem = {
      ...menuData,
      approvalStatus: "Pending",
      createdAt: new Date(),
    };
    const result = await usersvendorcollection.insertOne(newMenuItem);
    res.status(201).send({
      success: true,
      message: "Menu item submitted for admin approval",
      insertedId: result.insertedId,
      approvalStatus: newMenuItem.approvalStatus,
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

app.patch("/usersvendor/:id", verifyToken, async (req, res) => {
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

app.delete("/usersvendor/:id", verifyToken, async (req, res) => {
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

app.get("/usersvendor/featured/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await usersvendorcollection.find({ email: email }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch menu items" });
  }
});

app.post("/orders", verifyToken, async (req, res) => {
  try {
    const menuData = req.body;
    if (
      !menuData.productId ||
      !menuData.itemName ||
      !menuData.deliveryDate ||
      !menuData.deliveryAddress
    ) {
      return res.status(400).send({
        message: "Required fields are missing",
      });
    }
    const result = await usersordercollection.insertOne(menuData);
    res.status(201).send({
      success: true,
      message: "Order placed successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to place order",
    });
  }
});

// Get All Orders
app.get("/orders", verifyToken, async (req, res) => {
  try {
    const result = await usersordercollection.find().toArray();
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch orders",
    });
  }
});

// user delete card
app.delete("/orders/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid order ID",
      });
    }
    const result = await usersordercollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Order not found",
      });
    }
    res.status(200).send({
      message: "Order deleted successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete order",
    });
  }
});

app.get("/orders/:productId", verifyToken, async (req, res) => {
  try {
    const productId = req.params.productId;
    const result = await usersordercollection
      .find({ productId: productId })
      .toArray();
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch orders",
    });
  }
});

// Get Only Approved Menu Items
app.get("/usersvendor/approved", async (req, res) => {
  try {
    const result = await usersvendorcollection
      .find({ approvalStatus: "Approved" })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch approved menu items",
    });
  }
});

// Get All Users
app.get("/users", verifyToken, async (req, res) => {
  try {
    const result = await userscollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch users",
    });
  }
});

// Block / Unblock User
app.patch("/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;
    const result = await userscollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { isBlocked },
      },
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user",
    });
  }
});

// http://localhost:5000
app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
