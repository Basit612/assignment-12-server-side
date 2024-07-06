const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;


// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      
    ],
    credentials:true
  })
);
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:{process.env.DB_PASS}@cluster0.oowp99k.mongodb.net/?appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // await client.connect();

    const campCollection = client.db("primeCareDb").collection("camp");
    const userCollection = client.db("primeCareDb").collection("users");
    const joinCampCollection = client.db("primeCareDb").collection("joinCamp");
    const paymentsCollection = client.db("primeCareDb").collection("payments");


    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({ token });
    })

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" })
      }
      const token = req.headers.authorization.split(' ')[1]

      // verify token
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next()
      })
    }

    // use verify organizer after verify token
    const verifyOrganizer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query)
      const isOrganizer = user?.role === 'isOrganizer';
      if (!isOrganizer) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }


    // user related api
    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if yser doesnt exits:
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: "user already exist" })
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    })


    // admin get
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query)
      let isOrganizer = false;
      if (user) {
        isOrganizer = user?.role === 'isOrganizer'
      }
      res.send({ isOrganizer })
    })


    // add a camp
    app.post('/addCamp', async (req, res) => {
      const item = req.body;
      const result = await campCollection.insertOne(item)
      res.send(result)
    })

    // home card
    app.get('/addCamp', async (req, res) => {
      const result = await campCollection.find().toArray()
      res.send(result)

    })

    // card details
    app.get('/addCamp/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await campCollection.findOne(query)
      res.send(result)

    })

    // join camp modal
    app.post('/joinCamp', async (req, res) => {
      const item = req.body;
      const result = await joinCampCollection.insertOne(item)
      res.send(result)
    })


    // join camp data update status
    app.put('/joinCamp/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          paymentStatus: item.paymentStatus,
        }
      }

      const result = await joinCampCollection.updateOne(filter, updateDoc, options)

      res.send(result)
    })


    // manage camps for organizer
    app.get('/addCamp/manage/:email', async (req, res) => {
      const email = req.params.email;
      const query = { organizerEmail: email };

      const result = await campCollection.find(query).toArray()
      res.send(result)

    })


    // delete from manage camp
    app.delete('/addCamp/:id', verifyToken, verifyOrganizer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await campCollection.deleteOne(query);
      res.send(result)
    })


    // for update function get 
    app.get('/addCamp/update/:id', verifyToken, verifyOrganizer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await campCollection.findOne(query);
      res.send(result)
    })

    // for update function patch
    app.patch('/addCamp/update/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          campName: item.campName,
          dateTime: item.dateTime,
          location: item.location,
          healthcareProfessionalName: item.healthcareProfessionalName
        }
      }
      const result = await campCollection.updateOne(filter, updateDoc);
      res.send(result)
    })



    // registered manage data
    app.get('/joinCamp/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { organizerEmail: email }
      const result = await joinCampCollection.find(query).toArray()
      res.send(result)
    })

    // cancel  registered camp fro perticipant
    app.delete('/join/delete/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await joinCampCollection.deleteOne(query);
      res.send(result);
    })


    // cancel for manage registered cam by organizer
    app.delete('/manageRegisteredCamp/:id', verifyToken, verifyOrganizer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await joinCampCollection.deleteOne(query);
      res.send(result);
    })


    // registered camps for perticipant
    app.get('/joinCamp/MyData/:email', async (req, res) => {
      const email = req.params.email;
      const query = { PerticipantEmail: email }
      const result = await joinCampCollection.find(query).toArray();
      res.send(result)
    })




    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { campFees } = req.body;
      // console.log(campFees)
      const amount = parseInt(campFees * 100);
      // console.log(amount , 'inside intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']

      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // payments Info
    app.post('/payments', async (req, res) => {
      const payments = req.body;
      const result = await paymentsCollection.insertOne(payments);

      res.send(result)
    })

    // payment history
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { PerticipantEmail: req.params.email }

      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const result = await paymentsCollection.find(query).toArray();
      res.send(result)
    })



    // update for confirm organizer 
    app.patch('/join/confirm/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          confirmationStatus: 'Confirmed'
        }
      }
      const result = await joinCampCollection.updateOne(filter, updateDoc);
      res.send(result)
    })


    // update for confirm perticipant registered camp
    app.patch('/join/pay/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          paymentStatus: 'Paid'
        }
      }
      const result = await joinCampCollection.updateOne(filter, updateDoc);
      res.send(result)
    })


    // update for confirm perticipant registered camp
    app.patch('/paymentHistory/pay/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          confirmationStatus: 'Confirmed'
        }
      }
      const result = await paymentsCollection.updateOne(filter, updateDoc);
      res.send(result)
    })



    // perticipant count update
    app.patch('/perticipantCount/:id', async (req, res) => {
      const id = req.params.id
      const filter = { _id: new ObjectId(id) }
      const { participantCount } = req.body;
      const convert = parseInt(participantCount)

      const updateDoc = {
        $set: {
          participantCount: convert + 1
        }
      }
      const result = await campCollection.updateOne(filter, updateDoc)

      res.send(result)
    })






    // analytics
    app.get('/analytics/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { PerticipantEmail: email }
      const result = await joinCampCollection.find(query).toArray();

      res.send(result)

    })



    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('medical camp is coming')
})

app.listen(port, () => {
  console.log(`Medical camp is coming on port${port}`)
})