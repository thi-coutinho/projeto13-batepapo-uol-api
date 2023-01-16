import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'
import { stripHtml } from 'string-strip-html'

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

setInterval(async () => {
    const participants = await db.collection("participants").find().toArray()
    participants.forEach(async (p) => {
        const now = Date.now()
        if (now - p.lastStatus >= 10000) {
            await db.collection("participants").deleteOne({ _id: ObjectId(p._id) })
            let time = dayjs(now).format("HH:mm:ss")
            const message = { from: p.name, to: 'Todos', text: 'sai da sala...', type: 'status', time }
            await db.collection("messages").insertOne(message)
            console.log(`removed ${p.name}`)
        }

    })
}, 15000)


app.post('/participants', async (req, res) => {
    const name = stripHtml(req.body.name).result.trim()
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
    let { to, text, type } = req.body
    to = stripHtml(to).result.trim()
    text = stripHtml(text).result.trim()
    type = stripHtml(type).result.trim()
    const user = stripHtml(req.headers.user).result.trim()
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required()
    })
    const validation = messageSchema.validate({ to, text, type }, { abortEarly: false })
    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const foundUser = await db.collection("participants").findOne({ name: user })
        if (!foundUser) return res.status(422).send("user not found")
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

app.get('/messages', async (req, res) => {
    const { user } = req.headers
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined
    const messageSchema = joi.object({
        user: joi.string().required(),
        limit: joi.number().integer().min(1)
    })
    const validation = limit !== undefined ? messageSchema.validate({ user, limit }, { abortEarly: false }) :
        messageSchema.validate({ user })

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        let allMessages = await db.collection("messages").find().toArray()
        allMessages = allMessages.reverse().filter(m => {
            let validMessage = (m.to === "Todos" || m.from === user || m.to === user)
            return validMessage
        })

        if (limit) {
            res.send(allMessages.slice(0, limit).reverse())
        } else {
            res.send(allMessages)
        }

    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.post('/status', async (req, res) => {
    const { user } = req.headers
    try {
        const foundUser = await db.collection("participants").findOne({ name: user })
        if (!foundUser) return res.sendStatus(404)
        const id = foundUser._id
        await db.collection("participants").updateOne({ _id: ObjectId(id) }, { $set: { lastStatus: Date.now() } })
        res.send(`atualizado ${user} lastStatus`)

    } catch (error) {
        res.status(500).send(error.message)
    }

})

app.delete('/messages/:id', async (req,res) => {
    const {id} = req.params
    const {user} = req.headers

    const deleteSchema = joi.object({
        user: joi.string().required(),
        id: joi.string().alphanum().required()
    })
    const  validation = deleteSchema.validate({user,id},{abortEarly:false})
    if(validation.error) {
        const errors = validation.error.details.map((detail) => detail.message)
        res.status(422).send(errors)
    }

    try {

        const foundId = await db.collection("messages").findOne({_id: ObjectId(id)})
        if (!foundId) return res.sendStatus(404)
        if (foundId.from !== user) return res.sendStatus(401)
        await db.collection("messages").deleteOne({_id: ObjectId(id)})
        res.sendStatus(200)

        
    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.put('/messages/:id', async (req,res) => {
    let { to, text, type } = req.body
    const {id} = req.params
    const user = stripHtml(req.headers.user).result.trim()

    to = stripHtml(to).result.trim()
    text = stripHtml(text).result.trim()
    type = stripHtml(type).result.trim()
    
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required()
    })

    const validation = messageSchema.validate({ to, text, type }, { abortEarly: false })

    if(validation.error) {
        const errors = validation.error.details.map((detail) => detail.message)
        res.status(422).send(errors)
    }

    try {
        const foundUser = await db.collection("participants").findOne({ name: user })
        if (!foundUser) return res.status(422).send("user not found")


        const foundId = await db.collection("messages").findOne({_id: ObjectId(id)})
        if (!foundId) return res.sendStatus(404)
        if (foundId.from !== user) return res.sendStatus(401)
        const message = {to,text,type}
        await db.collection("messages").updateOne({_id: ObjectId(id)}, {$set: message})
        res.sendStatus(200)

        
    } catch (error) {
        res.status(500).send(error.message)
    }
})