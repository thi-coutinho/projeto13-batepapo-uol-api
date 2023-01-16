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

const mongoCilent = new MongoClient(process.env.DATABASE_URL)
await mongoCilent.connect()
let db = mongoCilent.db()

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