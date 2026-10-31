export const Categories = {
    categories: [
        {
            name: 'Dashboard',
            items: [],
            subcategories: [],
        },
        {
            name: 'Modules',
            items: [],
            subcategories: [],
        },
        {
            name: 'Catacombs',
            items: [],
            subcategories: [],
        },
        {
            name: 'Settings',
            items: [],
            subcategories: [],
            directComponents: [],
        },
        {
            name: 'Theme',
            items: [],
            subcategories: [],
            directComponents: [],
        },
        {
            name: 'Discord',
            items: [],
            subcategories: [],
            hiddenInSidebar: true,
        },

export const getVisibleDirectComponents = (categoryName) => {
    const category = Categories.categories.find((item) => item.name === categoryName);
    if (!category?.directComponents) return [];
    return Categories.selectedSubcategory === null
        ? category.directComponents
        : category.directComponents.filter((component) => component.sectionName === Categories.selectedSubcategory);
};

    ],
    selected: 'Dashboard',
    selectedItem: null,
    currentPage: 'categories',
    transitionProgress: 0,
    transitionDirection: 0,
    transitionStart: 0,
    selectedSubcategory: null,
    selectedSubcategoryButton: null,
    subcatScrollCategory: null,
    subcatScrollX: 0,
    subcatScrollUpdatedAt: 0,
    subcatTransitionProgress: 1,
    subcatTransitionStart: 0,
    subcatAnimationDuration: 200,
}
