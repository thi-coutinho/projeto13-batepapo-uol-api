import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'

dotenv.config()

const PORT = 5000
const app = express()
app.use(express.json())
app.use(cors())

const mongoClient = new MongoClient(process.env.DATABASE_URL)
try {
    await mongoClient.connect()
    console.log("MongoDB Connected!")
} catch (error) {
    console.log(err.message)
}
const db = mongoClient.db()

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

app.post('/participants', async (req, res) => {
    const { name } = req.body
    const nameSchema = joi.object({
        name: joi.string().required()
    })
    const validation = nameSchema.validate({ name })
    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const foundName = await db.collection("participants").findOne({ name })
        if (foundName) return res.status(409).send("Username already in use")
        let now = Date.now()
        await db.collection("participants").insertOne({ name, lastStatus: Date.now() })
        const entryMessage = {
            from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs(now).format('HH:mm:ss')
        }
        await db.collection("messages").insertOne(entryMessage)
        res.sendStatus(201)
    } catch (error) {
        res.status(500).send(error.message)
    }

})

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find({}).toArray()
        res.send(participants)
    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.post('/messages', async (req, res) => {
    const { to,text,type } = req.body
    const {user} = req.headers
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message','private_message').required()
    })
    const validation = messageSchema.validate({ to,text,type })
    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const foundUser = await db.collection("participants").findOne({ name:user })
        // const foundUser = await db.collection("participants").findOne({ name:to })
        if (!foundUser ) return res.status(409).send("Not valid user")
        let now = Date.now()
        const message = {
            from: user, to, text, type, time: dayjs(now).format('HH:mm:ss')
        }
        await db.collection("messages").insertOne(message)
        res.sendStatus(201)
    } catch (error) {
        res.status(500).send(error.message)
    }

})