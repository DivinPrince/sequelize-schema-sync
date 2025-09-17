import { Model, DataTypes, Sequelize } from 'sequelize';

export class AnimationView extends Model {
  public id!: number;
  public name!: string;
  public description!: string;
  public duration!: number; // New field
  public isActive!: boolean; // Another new field
  // Removed priority field
  public tags!: string; // Another newest field
  public createdAt!: Date;
  public updatedAt!: Date;
}

// Factory function that matches the user's requested pattern
export const AnimationViewModel = (sequelize: Sequelize): typeof AnimationView => {
  AnimationView.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Animation duration in milliseconds'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the animation is currently active'
    },
    // Removed priority field from model definition
    tags: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Comma-separated tags for the animation'
    }
  }, {
    sequelize,
    modelName: 'AnimationView',
    tableName: 'animation_views',
    timestamps: true,
  });
  
  return AnimationView;
};