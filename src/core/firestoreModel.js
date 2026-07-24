/**
 * Mongoose-like Firestore model helpers for minimal server.js changes.
 */
const { getFirestore } = require('./firebase');

function toDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return value;
}

function serializeValue(value) {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

function docToObject(snap) {
  if (!snap || !snap.exists) return null;
  const data = snap.data() || {};
  const obj = {
    _id: snap.id,
    id: snap.id,
    ...data
  };
  if (obj.createdAt) obj.createdAt = toDate(obj.createdAt);
  if (obj.updatedAt) obj.updatedAt = toDate(obj.updatedAt);
  if (obj.orderDate) obj.orderDate = toDate(obj.orderDate);
  if (obj.prescribedAt) obj.prescribedAt = toDate(obj.prescribedAt);
  if (obj.uploadedAt) obj.uploadedAt = toDate(obj.uploadedAt);
  if (obj.expiresAt) obj.expiresAt = toDate(obj.expiresAt);
  if (obj.acceptedAt) obj.acceptedAt = toDate(obj.acceptedAt);
  if (obj.rejectedAt) obj.rejectedAt = toDate(obj.rejectedAt);
  if (obj.lastSeenAt) obj.lastSeenAt = toDate(obj.lastSeenAt);

  obj.toObject = function toObject() {
    const copy = { ...this };
    delete copy.toObject;
    delete copy.save;
    return copy;
  };

  obj.save = async function save() {
    const col = getFirestore().collection(snap.ref.parent.id);
    const payload = serializeValue({ ...this });
    delete payload._id;
    delete payload.id;
    delete payload.toObject;
    delete payload.save;
    if (!payload.createdAt) payload.createdAt = new Date();
    await col.doc(snap.id).set(payload, { merge: true });
    Object.assign(this, payload);
    return this;
  };

  return obj;
}

function attachPersistenceMethods(normalized, source, colFn) {
  if (!normalized || !source || normalized === source) return normalized;
  const id = String(normalized._id || normalized.id || source._id || source.id || '');
  if (!id) return normalized;

  normalized.save = async function save() {
    const payload = serializeValue({ ...normalized });
    delete payload._id;
    delete payload.id;
    delete payload.toObject;
    delete payload.save;
    if (!payload.createdAt && source.createdAt) payload.createdAt = source.createdAt;
    await colFn().doc(id).set(payload, { merge: true });
    Object.assign(normalized, payload);
    Object.assign(source, payload);
    return normalized;
  };

  normalized.toObject = function toObject() {
    const copy = { ...normalized };
    delete copy.toObject;
    delete copy.save;
    return copy;
  };

  return normalized;
}

function matchesOperator(fieldValue, operatorValue) {
  if (operatorValue && typeof operatorValue === 'object' && !Array.isArray(operatorValue)) {
    if (operatorValue.$in) {
      return operatorValue.$in.includes(fieldValue);
    }
    if (operatorValue.$regex) {
      const re =
        operatorValue.$regex instanceof RegExp
          ? operatorValue.$regex
          : new RegExp(operatorValue.$regex, operatorValue.$options || '');
      return re.test(String(fieldValue ?? ''));
    }
  }
  return fieldValue === operatorValue;
}

function matchesFilter(doc, filter) {
  if (!filter || typeof filter !== 'object') return true;

  if (filter.$and) {
    return filter.$and.every((part) => matchesFilter(doc, part));
  }

  if (filter.$or) {
    return filter.$or.some((part) => matchesFilter(doc, part));
  }

  for (const [key, val] of Object.entries(filter)) {
    if (key.startsWith('$')) continue;
    if (!matchesOperator(doc[key], val)) return false;
  }
  return true;
}

function sortDocs(docs, sortSpec) {
  if (!sortSpec) return docs;
  const entries = Object.entries(sortSpec);
  return docs.slice().sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = a[field];
      const bv = b[field];
      const aTime = av instanceof Date ? av.getTime() : av;
      const bTime = bv instanceof Date ? bv.getTime() : bv;
      if (aTime < bTime) return dir >= 0 ? -1 : 1;
      if (aTime > bTime) return dir >= 0 ? 1 : -1;
    }
    return 0;
  });
}

function plainEqualityFilter(filter) {
  const out = {};
  if (!filter) return out;
  for (const [key, val] of Object.entries(filter)) {
    if (key.startsWith('$')) continue;
    if (key.startsWith('_web')) continue;
    if (key.startsWith('_public')) continue;
    if (val && typeof val === 'object' && !Array.isArray(val)) continue;
    out[key] = val;
  }
  return out;
}

class Query {
  constructor(model, filter, options = {}) {
    this.model = model;
    this.filter = filter || {};
    this.originalFilter = options.originalFilter || this.filter;
    this.sortSpec = null;
    this.limitN = null;
    this.single = !!options.single;
    this.projection = options.projection || null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  select(fields) {
    if (typeof fields === 'string') {
      this.projection = fields.split(/\s+/).filter(Boolean);
    }
    return this;
  }

  async exec() {
    return this.model._executeQuery(this);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

function createModel(collectionName, options = {}) {
  const col = () => getFirestore().collection(collectionName);
  const {
    transformQuery = (f) => f,
    postFilter = () => true,
    transformDoc = (d) => d
  } = options;

  const api = {
    collectionName,

    find(filter) {
      return new Query(api, transformQuery(filter || {}), { originalFilter: filter || {} });
    },

    findOne(filter) {
      return new Query(api, transformQuery(filter || {}), { single: true, originalFilter: filter || {} });
    },

    async findById(id) {
      if (!id) return null;
      const snap = await col().doc(String(id)).get();
      const doc = docToObject(snap);
      if (!doc) return null;
      const normalized = transformDoc(doc);
      return attachPersistenceMethods(normalized, doc, col);
    },

    async findByIdAndUpdate(id, update, options = {}) {
      const ref = col().doc(String(id));
      const snap = await ref.get();
      if (!snap.exists) return null;
      const current = docToObject(snap);
      const raw = serializeValue(update);
      const payload = raw.$set ? { ...raw.$set } : { ...raw };
      delete payload.$set;
      const next = { ...current, ...payload };
      delete next._id;
      delete next.id;
      delete next.toObject;
      delete next.save;
      await ref.set(next, { merge: true });
      const updated = await ref.get();
      return options.new === false ? current : docToObject(updated);
    },

    async findByIdAndDelete(id) {
      const ref = col().doc(String(id));
      const snap = await ref.get();
      if (!snap.exists) return null;
      const doc = docToObject(snap);
      await ref.delete();
      return doc;
    },

    async findOneAndUpdate(filter, update, options = {}) {
      const doc = await api.findOne(filter);
      if (!doc && options.upsert) {
        return api.create({ ...filter, ...update });
      }
      if (!doc) return null;
      return api.findByIdAndUpdate(doc._id, update, options);
    },

    async create(data) {
      const payload = serializeValue({ ...data });
      if (!payload.createdAt) payload.createdAt = new Date();
      const ref = payload._id ? col().doc(String(payload._id)) : col().doc();
      delete payload._id;
      await ref.set(payload);
      return api.findById(ref.id);
    },

    async distinct(field, filter = {}) {
      const docs = await api.find(filter).exec();
      return [...new Set(docs.map((d) => d[field]).filter((v) => v != null && String(v).trim() !== ''))];
    },

    async _executeQuery(query) {
      const equality = plainEqualityFilter(query.filter);
      const hasAdvanced = JSON.stringify(query.filter).includes('"$');

      let docs = [];

      if (!hasAdvanced && Object.keys(equality).length > 0) {
        let ref = col();
        for (const [key, val] of Object.entries(equality)) {
          ref = ref.where(key, '==', val);
        }
        const snap = await ref.get();
        docs = snap.docs.map(docToObject);
        docs = docs.filter((doc) => matchesFilter(doc, query.filter));
      } else if (!hasAdvanced && Object.keys(query.filter).length === 0) {
        const snap = await col().get();
        docs = snap.docs.map(docToObject);
      } else {
        const snap = await col().get();
        docs = snap.docs.map(docToObject).filter((doc) => matchesFilter(doc, query.filter));
      }

      docs = docs.filter((doc) => postFilter(doc, query.originalFilter));
      docs = docs.map((doc) => attachPersistenceMethods(transformDoc(doc), doc, col));

      if (query.projection) {
        docs = docs.map((doc) => {
          const picked = { _id: doc._id, id: doc.id };
          query.projection.forEach((field) => {
            if (field.startsWith('-')) return;
            picked[field] = doc[field];
          });
          return picked;
        });
      }

      docs = sortDocs(docs, query.sortSpec);
      if (query.limitN != null) docs = docs.slice(0, query.limitN);
      if (query.single) return docs[0] || null;
      return docs;
    }
  };

  function Model(data = {}) {
    if (!(this instanceof Model)) {
      return api.create(data);
    }
    Object.assign(this, serializeValue(data));
    if (this._id) this.id = this._id;
  }

  Model.prototype.save = async function save() {
    const payload = serializeValue({ ...this });
    delete payload.toObject;
    delete payload.save;

    if (!payload.createdAt) payload.createdAt = new Date();

    if (this._id) {
      const ref = col().doc(String(this._id));
      delete payload._id;
      delete payload.id;
      await ref.set(payload, { merge: true });
      const saved = await api.findById(this._id);
      const saveMethod = this.save;
      const toObjectMethod = this.toObject;
      Object.assign(this, saved);
      if (saveMethod) this.save = saveMethod;
      if (toObjectMethod) this.toObject = toObjectMethod;
      return this;
    }

    const ref = col().doc();
    delete payload._id;
    delete payload.id;
    await ref.set(payload);
    this._id = ref.id;
    this.id = ref.id;
    Object.assign(this, payload);
    return this;
  };

  Model.prototype.toObject = function toObject() {
    const copy = { ...this };
    delete copy.toObject;
    delete copy.save;
    return copy;
  };

  Object.assign(Model, api);
  return Model;
}

module.exports = {
  createModel,
  docToObject,
  serializeValue,
  matchesFilter,
  attachPersistenceMethods
};
