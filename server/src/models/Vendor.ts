import mongoose, { Schema, type Document } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  type: 'vendor' | 'host' | 'supplier' | 'freelancer';
  email?: string;
  phone?: string;
  contact?: string;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorSchema = new Schema<IVendor>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['vendor', 'host', 'supplier', 'freelancer'],
      default: 'vendor',
    },
    email: String,
    phone: String,
    contact: String,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes: String,
  },
  { timestamps: true }
);

export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);
