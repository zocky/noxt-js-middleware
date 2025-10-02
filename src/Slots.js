export default class Slots {
      #slots = {};
      #ensureSlot = (id) => this.#slots[id] ??= { anon: [], named: {} };
      slot = (id, ...args) => {
        switch(args.length) {
          case 0: return this.get(id);
          case 1: return this.add(id, args[0]);
          case 2: 
            if (args[0] === null) return this.add(id, args[1]);
            return this.set(id, args[0], args[1]);
          default: throw new Error('Invalid arguments');
        }
      }
      get(id) {
        const slot = this.#ensureSlot(id);        
        return [...slot.anon, ...Object.values(slot.named)];
      }
      add(id, value) {
        console.log('add', id, value);
        this.#ensureSlot(id);
        this.#slots[id].anon.push(value);
      }
      set(id, key, value) {
        console.log('set', id, key, value);
        this.#ensureSlot(id);
        this.#slots[id].named[key] = value;
      }
    }