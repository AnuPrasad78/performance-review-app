import type { Employee } from './types'

export const seedRoster: Employee[] = [
  { firstName: 'Asha', lastName: 'Nair', email: 'asha.nair@emids.com', role: 'Engineer', department: 'Quality', manager: 'Ravi Menon' },
  { firstName: 'Dev', lastName: 'Iyer', email: 'dev.iyer@emids.com', role: 'Engineer', department: 'Delivery', manager: 'Ravi Menon' },
  { firstName: 'Meera', lastName: 'Suresh', email: 'meera.suresh@emids.com', role: 'Senior Engineer', department: 'Quality', manager: 'Anika Rao' },
  { firstName: 'Rahul', lastName: 'Verma', email: 'rahul.verma@emids.com', role: 'Analyst', department: 'Analytics', manager: 'Anika Rao' },
  { firstName: 'Sana', lastName: 'Khan', email: 'sana.khan@emids.com', role: 'Business Analyst', department: 'Analytics', manager: 'Joseph Mathew' },
  { firstName: 'Vikram', lastName: 'Paul', email: 'vikram.paul@emids.com', role: 'Team Lead', department: 'Delivery', manager: 'Joseph Mathew' },
]
