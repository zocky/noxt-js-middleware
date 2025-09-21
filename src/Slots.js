export default class Slots {
      #slots = {};
      #ensureSlot = (id) => this.#slots[id] ??= { anon: [], named: {} };
      slot = (id, ...args) => {
        switch(args.length) {
          case 0: return this.get(id);
          case 1: throw new Error('Invalid arguments, use null to add an anonymous item to ' + id);
          case 2: 
            if (args[1] === null) return this.add(id, args[0]);
            return this.set(id, args[0], args[1]);
          default: throw new Error('Invalid arguments');
        }
      }
      get(id) {
        const slot = this.#ensureSlot(id);        
        return [...slot.anon, ...Object.values(slot.named)];
      }
      add(id, value) {
        this.#ensureSlot(id);
        this.#slots[id].anon.push(value);
      }
      set(id, key, value) {
        this.#ensureSlot(id);
        this.#slots[id].named[key] = value;
      }
    }