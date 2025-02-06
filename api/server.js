const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const STORAGE_FILE = path.join(__dirname, 'items.json');

app.use(cors());
app.use(bodyParser.json());

async function ensureStorageFile() {
    try {
        await fs.access(STORAGE_FILE);
    } catch (error) {
        const defaultItems = [
            { id: 1, name: 'Item 1', description: 'Description 1' },
            { id: 2, name: 'Item 2', description: 'Description 2' },
        ];
        await fs.writeFile(STORAGE_FILE, JSON.stringify(defaultItems, null, 2));
        console.log('Storage file created successfully');
    }
}

async function loadItems() {
    try {
        const data = await fs.readFile(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading items:', error);
        throw new Error('Failed to load items');
    }
}

async function saveItems(items) {
    try {
        await fs.writeFile(STORAGE_FILE, JSON.stringify(items, null, 2));
        console.log('Items saved successfully');
    } catch (error) {
        console.error('Error saving items:', error);
        throw new Error('Failed to save items');
    }
}

async function initializeStorage() {
    try {
        await ensureStorageFile();
        console.log('Storage initialized successfully');
    } catch (error) {
        console.error('Failed to initialize storage:', error);
        process.exit(1);
    }
}

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Item Management API',
            version: '1.0.0',
            description: 'API for managing items',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
    },
    apis: ['./server.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Get all items
 *     responses:
 *       200:
 *         description: Returns a list of items
 */
app.get('/api/items', async (req, res) => {
    try {
        const items = await loadItems();
        res.json(items);
    } catch (error) {
        console.error('GET /api/items error:', error);
        res.status(500).json({ message: 'Error loading items' });
    }
});
/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Get an item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Returns the requested item
 *       404:
 *         description: Item not found
 */
app.get('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const item = items.find(i => i.id === parseInt(req.params.id));
        if (!item) return res.status(404).json({ message: 'Item not found' });
        res.json(item);
    } catch (error) {
        console.error('GET /api/items/:id error:', error);
        res.status(500).json({ message: 'Error loading item' });
    }
});
/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Create a new item
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Item created successfully
 */
app.post('/api/items', async (req, res) => {
    try {
        const items = await loadItems();
        const newItem = {
            id: items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1,
            name: req.body.name,
            description: req.body.description
        };
        items.push(newItem);
        await saveItems(items);
        console.log('New item created:', newItem);
        res.status(201).json(newItem);
    } catch (error) {
        console.error('POST /api/items error:', error);
        res.status(500).json({ message: 'Error creating item' });
    }
});
/**
 * @swagger
 * /api/items/{id}:
 *   patch:
 *     summary: Update an existing item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 */
app.patch('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const item = items.find(i => i.id === parseInt(req.params.id));
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (req.body.name) item.name = req.body.name;
        if (req.body.description) item.description = req.body.description;

        await saveItems(items);
        console.log('Item updated:', item);
        res.json(item);
    } catch (error) {
        console.error('PATCH /api/items/:id error:', error);
        res.status(500).json({ message: 'Error updating item' });
    }
});
/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Delete an item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item deleted successfully
 */
app.delete('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const itemIndex = items.findIndex(i => i.id === parseInt(req.params.id));
        if (itemIndex === -1) return res.status(404).json({ message: 'Item not found' });

        const deletedItem = items.splice(itemIndex, 1)[0];
        await saveItems(items);
        console.log('Item deleted:', deletedItem);
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('DELETE /api/items/:id error:', error);
        res.status(500).json({ message: 'Error deleting item' });
    }
});

initializeStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
        console.log(`Storage file location: ${STORAGE_FILE}`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
});

const PORT = 3000;